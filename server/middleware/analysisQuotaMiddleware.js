/**
 * Analysis quota & cooldown middleware.
 *
 * Limits (all configurable via env):
 *   - Guest (per IP):   GUEST_DAILY_ANALYSIS_LIMIT (5) SUCCESSFUL analyses per UTC day
 *   - Authenticated:    AUTH_DAILY_ANALYSIS_LIMIT (20) analyses per UTC day
 *   - Everyone:         ANALYSIS_COOLDOWN_MINUTES (10) minimum gap between
 *                       two SUCCESSFUL analyses
 *
 * Design notes:
 *   - Guest DAILY quota counts only SUCCESSFUL analyses (in-memory per IP),
 *     via recordGuestAnalysis on the success path. This fixes the bug where
 *     cooldown rejections / validation / AI failures were charged against the
 *     daily cap — they now leave the count untouched. The check runs before
 *     upload, so quota/cooldown rejections never write a temp file.
 *   - Guest COOLDOWN counts successes only too. A failed attempt never locks a
 *     user out for 10 minutes, and repeated clicks during cooldown leave the
 *     daily quota unchanged.
 *   - In-memory = per process; fine for a single-instance deployment.
 *   - A separate, request-based global rate limit (100 req/15min per IP in
 *     app.js) still guards against fuzzing/DoS — it is NOT the daily quota.
 *   - Skipped entirely when NODE_ENV=test so the automated suites are unaffected.
 */
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { Analysis } from "../models/Analysis.js";

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

// ---- Guest state (per IP, in-memory, single-instance) ----
// Only SUCCESSFUL analyses mutate this state, so cooldown rejections and
// validation/AI failures can never consume a guest's quota.
const lastGuestAnalysisAt = new Map(); // ip -> timestamp of last successful analysis
const guestDailySuccesses = new Map(); // ip -> { date: 'YYYY-MM-DD', count }

function utcDateKey() {
  return new Date().toISOString().slice(0, 10);
}

/** @returns {number} SUCCESSFUL guest analyses for this IP today (UTC). */
export function getGuestDailyCount(ip) {
  if (typeof ip !== "string") return 0;
  const entry = guestDailySuccesses.get(ip);
  if (!entry || entry.date !== utcDateKey()) return 0;
  return entry.count;
}

/**
 * Record a SUCCESSFUL guest analysis: start the cooldown clock and bump today's
 * success count. Called ONLY from the controller's success path, so failures
 * (cooldown rejection, validation, AI errors, network) never consume quota.
 */
export function recordGuestAnalysis(ip) {
  if (typeof ip !== "string") return;
  lastGuestAnalysisAt.set(ip, Date.now());
  const today = utcDateKey();
  const entry = guestDailySuccesses.get(ip);
  if (!entry || entry.date !== today) {
    guestDailySuccesses.set(ip, { date: today, count: 1 });
  } else {
    entry.count += 1;
  }
}

// Test seams (used only by server/tests/runQuotaTests.mjs): fast-forward the
// in-memory guest state so quota/cooldown behavior can be asserted without
// waiting for the real 10-minute cooldown.
export function __testClearGuestState() {
  lastGuestAnalysisAt.clear();
  guestDailySuccesses.clear();
}
export function __testAdvanceGuestCooldowns(msAgo) {
  const now = Date.now();
  for (const [ip, ts] of lastGuestAnalysisAt) {
    lastGuestAnalysisAt.set(ip, now - msAgo);
  }
}

// ---- Authenticated daily cap + universal cooldown (DB-based) ----
export async function analysisQuota(req, _res, next) {
  try {
    if (isTestEnv()) return next();

    // Universal 10-minute cooldown between successful analyses.
    if (req.user) {
      const latest = await Analysis.findOne({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .select("createdAt")
        .lean();
      if (latest?.createdAt) {
        const elapsed = Date.now() - new Date(latest.createdAt).getTime();
        if (elapsed < env.analysisCooldownMs) {
          throw cooldownError(env.analysisCooldownMs - elapsed);
        }

        // Daily cap for authenticated users (UTC calendar day). Only persisted
        // (= successful) analyses count.
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
      }
    } else {
      // ---- Guest path ----
      // 1) Cooldown (successes only). Rejected here, BEFORE any count change, so
      //    repeated clicks during cooldown leave the daily quota untouched.
      const last = lastGuestAnalysisAt.get(req.ip);
      if (last) {
        const elapsed = Date.now() - last;
        if (elapsed < env.analysisCooldownMs) {
          throw cooldownError(env.analysisCooldownMs - elapsed);
        }
      }

      // 2) Daily quota (SUCCESSFUL analyses only). A guest that has already
      //    completed today's limit is rejected before upload/AI runs.
      const used = getGuestDailyCount(req.ip);
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