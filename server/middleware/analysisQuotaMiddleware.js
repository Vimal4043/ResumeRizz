/**
 * Analysis quota & cooldown middleware.
 *
 * Limits (hardcoded in config/env.js — NOT env-configurable by design):
 *   - Guest (per session): 1 SUCCESSFUL analysis per UTC day
 *   - Authenticated:       2 analyses per UTC day
 *   - Everyone:            ANALYSIS_COOLDOWN_MINUTES minimum gap between
 *                          two SUCCESSFUL analyses (env-configurable, default 10)
 *
 * Design notes:
 *   - Guest DAILY quota counts only SUCCESSFUL analyses, tracked in the
 *     DailyUsage collection keyed by guest session ID (not raw IP, so
 *     NAT/shared WiFi does not merge unrelated browsers). Cooldown
 *     rejections / validation / AI failures leave the count untouched.
 *     The check runs before upload, so quota/cooldown rejections never
 *     write a temp file.
 *   - Guest COOLDOWN counts successes only too. A failed attempt never locks
 *     a user out, and repeated clicks during cooldown leave quota unchanged.
 *   - Authenticated daily cap counts only successful (persisted) analyses.
 *   - A separate request-based global rate limit (100 req/15min per IP in
 *     app.js) still guards against fuzzing/DoS — it is NOT the daily quota.
 *   - Skipped entirely when NODE_ENV=test so automated suites are unaffected.
 */
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { Analysis } from "../models/Analysis.js";
import { DailyUsage, utcDateKey } from "../models/DailyUsage.js";

const isTestEnv = () => env.nodeEnv === "test";

/** Build a cooldown AppError carrying the safe retry hint the frontend uses. */
function cooldownError(retryAfterMs) {
  const minutesLeft = Math.max(1, Math.ceil(retryAfterMs / 60_000));
  const err = new AppError(
    `Please wait about ${minutesLeft} more minute${minutesLeft > 1 ? "s" : ""} between analyses.`,
    429,
    "ANALYSIS_COOLDOWN",
  );
  err.retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
  return err;
}

/**
 * Record a SUCCESSFUL guest analysis: increment the DB-backed daily usage and
 * start the cooldown clock. Called ONLY from the controller's success path, so
 * failures (cooldown rejection, validation, AI errors, network) never consume
 * quota.
 */
export async function recordGuestAnalysis(sessionId) {
  if (typeof sessionId !== "string" || !sessionId) return;
  const principal = `guest:${sessionId}`;
  const today = utcDateKey();
  await DailyUsage.findOneAndUpdate(
    { principal, date: today },
    { $inc: { used: 1 } },
    { upsert: true, returnDocument: "after" },
  ).catch((err) => {
    console.error(`[ DailyUsage ] markUsed failed for ${principal}:`, err.message);
  });
  recordGuestCooldown(sessionId);
}

// ---- Guest cooldown timestamps (in-memory, single-instance) ----
// Only the cooldown timestamp is kept here; the DAILY COUNT lives in
// DailyUsage so a restart doesn't lose quota tracking.
const guestLastAnalysisAt = new Map(); // sessionId -> timestamp

function guestLastSuccess(sessionId) {
  if (typeof sessionId !== "string" || !sessionId) return null;
  return guestLastAnalysisAt.get(sessionId) ?? null;
}

function recordGuestCooldown(sessionId) {
  if (typeof sessionId !== "string" || !sessionId) return;
  guestLastAnalysisAt.set(sessionId, Date.now());
}

/**
 * Merge a guest session's today's usage into a verified user's row.
 * Called by the auth controller after a successful login/register, BEFORE the
 * guest cookie is cleared.
 *
 * The guest's `used` count for today is moved into the user's row (so the
 * user is never granted a fresh quota on top of what the guest already
 * consumed). The guest row is then deleted. From that point the user's row
 * is the single source of truth for that browser.
 *
 * @param {string} sessionId - guest session hex id
 * @param {string} userId    - verified user's MongoDB ObjectId string
 * @returns {Promise<number>} number of analyses transferred (0 if none)
 */
export async function mergeGuestUsage(sessionId, userId) {
  if (typeof sessionId !== "string" || !sessionId) return 0;
  if (typeof userId !== "string" || !userId) return 0;

  const today = utcDateKey();
  const guestPrincipal = `guest:${sessionId}`;

  const guestRow = await DailyUsage.findOne({
    principal: guestPrincipal,
    date: today,
  }).lean();
  if (!guestRow) return 0;

  const transferred = Math.max(0, guestRow.used ?? 0);
  if (transferred === 0) {
    await DailyUsage.deleteOne({ principal: guestPrincipal, date: today }).catch(
      () => {},
    );
    return 0;
  }

  await DailyUsage.findOneAndUpdate(
    { principal: userId, date: today },
    { $inc: { used: transferred } },
        { upsert: true, returnDocument: "after" },
  ).catch(() => {});

  await DailyUsage.deleteOne({ principal: guestPrincipal, date: today }).catch(
    () => {},
  );

  return transferred;
}

// Main quota enforcement — single definition (test seams kept in one place below).
export async function analysisQuota(req, _res, next) {
  try {
    if (isTestEnv()) return next();

    const today = utcDateKey();

    if (req.user) {
      // ---- Authenticated (verified) user ----
      const latest = await Analysis.findOne({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .select("createdAt")
        .lean();
      if (latest?.createdAt) {
        const elapsed = Date.now() - new Date(latest.createdAt).getTime();
        if (elapsed < env.analysisCooldownMs) {
          throw cooldownError(env.analysisCooldownMs - elapsed);
        }
      }

      // Daily cap for authenticated users (UTC calendar day). Only persisted
      // (= successful) analyses count — and this check must run even when there
      // is no prior analysis (todayCount is then 0, which is < limit).
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      const todayCount = await Analysis.countDocuments({
        userId: req.user._id,
        createdAt: { $gte: startOfDay },
      });
      if (todayCount >= env.authDailyAnalysisLimit) {
        throw new AppError(
          `You've reached your daily limit of ${env.authDailyAnalysisLimit} analyses. Your quota resets at midnight UTC.`,
          429,
          "DAILY_ANALYSIS_LIMIT_REACHED",
        );
      }
    } else {
      // ---- Guest path ----
      const sessionId = req.guestSessionId;

      // 1) Cooldown (successes only).
      const last = guestLastSuccess(sessionId);
      if (last) {
        const elapsed = Date.now() - last;
        if (elapsed < env.analysisCooldownMs) {
          throw cooldownError(env.analysisCooldownMs - elapsed);
        }
      }

      // 2) Daily quota (DB-backed via DailyUsage).
      const guestRow = await DailyUsage.findOne({
        principal: `guest:${sessionId}`,
        date: today,
      }).lean();
      const used = guestRow?.used ?? 0;
      if (used >= env.guestDailyAnalysisLimit) {
        throw new AppError(
          `You've reached the free daily limit of ${env.guestDailyAnalysisLimit} analyses. Please try again tomorrow or create a free account for more.`,
          429,
          "ANALYSIS_QUOTA_EXCEEDED",
        );
      }
    }

    return next();
  } catch (error) {
    next(error);
  }
}

// Test seams (single definition of each — used by the quota test suite).
export function __testClearGuestCooldownState() {
  guestLastAnalysisAt.clear();
}
export function __testAdvanceGuestCooldowns(msAgo) {
  const now = Date.now();
  for (const [sid, ts] of guestLastAnalysisAt) {
    guestLastAnalysisAt.set(sid, now - msAgo);
  }
}
export const __testClearGuestState = __testClearGuestCooldownState;
export async function getGuestDailyCount(sessionId) {
  if (typeof sessionId !== "string" || !sessionId) return 0;
  const row = await DailyUsage.findOne({
    principal: `guest:${sessionId}`,
    date: utcDateKey(),
  }).lean();
  return row?.used ?? 0;
}