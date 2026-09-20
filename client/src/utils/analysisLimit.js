/**
 * Client-side daily analysis limit.
 *
 * The daily analysis limit is enforced ENTIRELY in the browser: the backend no
 * longer rejects analysis requests because of quota or cooldown. After a
 * SUCCESSFUL analysis we store a per-identity flag in localStorage recording the
 * UTC calendar date it was used on. On the next attempt we block the request
 * locally until the UTC calendar day changes.
 *
 * Keys (guest and authenticated users are tracked independently):
 *   - guest:         "resumerizz_guest_analysis_used"
 *   - authenticated: "resumerizz_analysis_used_<userId>"
 *
 * Stored shape (the date is kept alongside the flag so the limit resets at the
 * next UTC calendar day — never a rolling 24-hour timer):
 *   { used: true, date: "YYYY-MM-DD" }
 *
 * Signing in or out never moves or clears a flag: the guest key stays the guest
 * key, and every account keeps its own flag across logins and logouts.
 */

export const GUEST_ANALYSIS_USED_KEY = "resumerizz_guest_analysis_used";
export const AUTH_ANALYSIS_USED_KEY_PREFIX = "resumerizz_analysis_used_";

/** Machine-readable code for a locally blocked (limit-reached) attempt. */
export const ANALYSIS_LIMIT_CODE = "ANALYSIS_LIMIT_REACHED";

/** Exact user-facing copy shown when the daily limit is reached. */
export const ANALYSIS_LIMIT_MESSAGE =
  "Today's analysis limit has been reached. Please try again tomorrow.";

/**
 * Today's UTC calendar date as "YYYY-MM-DD".
 * This is the reset boundary of the daily limit.
 * @param {Date} [now]
 * @returns {string}
 */
export function todayUtcDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * localStorage key for an identity: per-account when signed in, else the guest
 * key. Guest and authenticated states are therefore always independent.
 * @param {string|null|undefined} userId
 * @returns {string}
 */
export function analysisUsedKey(userId) {
  return userId
    ? `${AUTH_ANALYSIS_USED_KEY_PREFIX}${userId}`
    : GUEST_ANALYSIS_USED_KEY;
}

/** localStorage, or null when unavailable (SSR / private mode / blocked). */
function safeStorage() {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Read + parse the stored record for a key. Returns null when absent/invalid. */
function readRecord(key) {
  const storage = safeStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * True when this identity has already used today's analysis.
 *
 * A record from a PREVIOUS UTC day is stale: its key is removed automatically
 * and the analysis is allowed again. There is deliberately no fixed 24-hour
 * timer — the limit resets at the next UTC calendar day.
 *
 * @param {string|null|undefined} userId
 * @param {Date} [now]
 * @returns {boolean}
 */
export function hasUsedToday(userId, now = new Date()) {
  const key = analysisUsedKey(userId);
  const record = readRecord(key);
  if (!record) return false;
  if (record.date !== todayUtcDate(now)) {
    const storage = safeStorage();
    try {
      if (storage) storage.removeItem(key);
    } catch {
      /* ignore — the stale record simply won't match today's date */
    }
    return false;
  }
  return record.used === true;
}

/**
 * Record that today's analysis was used for this identity.
 *
 * Called ONLY after a successful analysis — a failed or errored request must
 * never consume the limit, and nothing is written when the request starts.
 *
 * @param {string|null|undefined} userId
 * @param {Date} [now]
 */
export function markAnalysisUsed(userId, now = new Date()) {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(
      analysisUsedKey(userId),
      JSON.stringify({ used: true, date: todayUtcDate(now) }),
    );
  } catch {
    /* storage unavailable — nothing else we can do */
  }
}

/**
 * Structured error used when the client-side limit blocks an attempt. It is
 * shaped like the backend analysis errors so the UI can render it uniformly.
 */
export function analysisLimitError() {
  return {
    code: ANALYSIS_LIMIT_CODE,
    message: ANALYSIS_LIMIT_MESSAGE,
    retryAfterSeconds: 0,
  };
}
