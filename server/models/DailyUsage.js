import mongoose from "mongoose";

/**
 * Daily analysis usage tracker.
 *
 * Tracks how many analyses a principal has consumed today (UTC calendar day).
 * There are two kinds of principals:
 *   - "guest:{sessionId}"  — a browser that is not logged in (identified by an
 *     HttpOnly cookie issued by guestSessionMiddleware). Counted per session, not
 *     per IP, so that NAT/shared-WiFi does not merge unrelated browsers into one
 *     quota bucket. A session lives as long as its cookie (7 days) or until the
 *     browser clears cookies.
 *   - "{userId}"           — an authenticated user, identified by their MongoDB
 *     ObjectId string. Authenticated users get the higher daily cap.
 *
 * Every SUCCESSFUL analysis (the one the user actually sees the result for)
 * increments `used` by 1, atomically, via $inc. Failed / rejected requests
 * (cooldown, validation, AI errors) never touch this collection, so they can
 * never consume quota. This is enforced by calling markUsed() ONLY from the
 * controller's success path.
 *
 * The guest→user quota transfer works as follows:
 *   1. A guest analysing today consumes from their guest session's DailyUsage row.
 *   2. When the same browser later logs in or registers, the auth controller calls
 *      mergeGuestUsage(sessionId, userId) BEFORE clearing the guest cookie.
 *   3. mergeGuestUsage moves the guest's `used` count for today into the user's row
 *      (capped so the user is never charged more than the guest has actually used).
 *      The guest row is then deleted. From that point on the user's row is the
 *      single source of truth for that browser.
 *
 * Reset: rows older than the current UTC day are ignored by the quota middleware
 * (it always queries for today's date), and a nightly cron-style cleanup can
 * delete stale rows. For simplicity a TTL-like query is used in the middleware
 * and in tests; explicit cleanup is out of scope for the current phase.
 */
const dailyUsageSchema = new mongoose.Schema(
  {
    principal: {
      type: String,
      required: true,
      index: true,
      // Format: "guest:{hex}" or "{userId}"
      lowercase: false,
    },
    // UTC calendar date this row tracks, e.g. "2026-09-09".
    date: { type: String, required: true, index: true },
    // How many SUCCESSFUL analyses this principal has consumed today.
    used: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

// One row per principal per day. Upsert is used in markUsed() so the row is
// created on first use and updated thereafter.
dailyUsageSchema.index({ principal: 1, date: 1 }, { unique: true });

/** @returns {string} today's UTC date key, e.g. "2026-09-09". */
export function utcDateKey() {
  return new Date().toISOString().slice(0, 10);
}

export const DailyUsage = mongoose.model("DailyUsage", dailyUsageSchema);