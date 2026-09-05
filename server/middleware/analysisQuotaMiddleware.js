/**
 * Analysis quota & cooldown middleware.
 *
 * Limits (all configurable via env):
 *   - Guest (per IP):   GUEST_DAILY_ANALYSIS_LIMIT (5) analyses per UTC day
 *   - Authenticated:    AUTH_DAILY_ANALYSIS_LIMIT (20) analyses per UTC day
 *   - Everyone:         ANALYSIS_COOLDOWN_MINUTES (10) minimum gap between
 *                       two SUCCESSFUL analyses
 *
 * Design notes:
 *   - The guest daily cap uses express-rate-limit (in-memory, per IP) and is
 *     registered BEFORE the upload middleware, so a rejected request never
 *     writes a temp file. It counts every request (including validation
 *     failures) — this deliberately also throttles obvious fuzzing.
 *   - The guest COOLDOWN, however, only counts successful analyses (tracked in
 *     memory by the controller via recordGuestAnalysis) — a failed validation
 *     attempt never locks a user out for 10 minutes. In-memory = per process;
 *     fine for a single-instance deployment.
 *   - Authenticated caps are DB-based (Analysis collection), so they survive
 *     restarts and apply across the user's devices. Only persisted (= successful)
 *     analyses count against the daily cap.
 *   - Skipped entirely when NODE_ENV=test so the automated suites can hammer
 *     the endpoint.
 */
import { rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { Analysis } from "../models/Analysis.js";

const isTestEnv = () => env.nodeEnv === "test";

// express-rate-limit rejects here with its own 429 — use the standard error
// shape so the frontend can key off `error.code` instead of message text.
function limitResponse(message, code) {
  return (_req, res) => {
    res.status(429).json({
      success: false,
      message,
      error: { code, message },
    });
  };
}

// ---- Guest daily cap (per IP, in-memory, 24h window) ----
export const guestDailyAnalysisLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // rolling 24h window
  limit: env.guestDailyAnalysisLimit,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: (req) => isTestEnv() || Boolean(req.user),
  handler: limitResponse(
    "You've reached the free daily limit of 5 analyses. Please try again tomorrow or create a free account for more.",
    "GUEST_DAILY_ANALYSIS_LIMIT_REACHED",
  ),
});

// ---- Guest cooldown tracking (per IP, in-memory, successes only) ----
const lastGuestAnalysisAt = new Map(); // ip -> timestamp of last successful analysis

/** Record a successful guest analysis for cooldown purposes. Call once per success. */
export function recordGuestAnalysis(ip) {
  if (typeof ip === "string") lastGuestAnalysisAt.set(ip, Date.now());
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
          const minutesLeft = Math.max(
            1,
            Math.ceil((env.analysisCooldownMs - elapsed) / 60_000),
          );
          throw new AppError(
            `Please wait about ${minutesLeft} more minute${minutesLeft > 1 ? "s" : ""} between analyses.`,
            429,
            "ANALYSIS_COOLDOWN",
          );
        }

        // Daily cap for authenticated users (UTC calendar day).
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
      // Guest cooldown (successes only, per IP).
      const last = lastGuestAnalysisAt.get(req.ip);
      if (last) {
        const elapsed = Date.now() - last;
        if (elapsed < env.analysisCooldownMs) {
          const minutesLeft = Math.max(
            1,
            Math.ceil((env.analysisCooldownMs - elapsed) / 60_000),
          );
          throw new AppError(
            `Please wait about ${minutesLeft} more minute${minutesLeft > 1 ? "s" : ""} between analyses.`,
            429,
            "ANALYSIS_COOLDOWN",
          );
        }
      }
    }

    return next();
  } catch (error) {
    next(error);
  }
}