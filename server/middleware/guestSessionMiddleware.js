/**
 * Guest session middleware.
 *
 * Assigns every unauthenticated request a stable, server-issued session ID
 * stored in an HttpOnly cookie named "guest_session". The ID is a 32-byte
 * crypto random hex string.
 *
 * Purpose:
 *   - Identify a guest browser across requests so the quota middleware can
 *     track that browser's daily analysis usage (1/day) in the DailyUsage
 *     collection instead of by raw IP (which would merge unrelated browsers
 *     behind a NAT/shared WiFi).
 *   - Enable safe guest→user quota transfer: when the same browser later
 *     logs in or registers, the auth controller reads this cookie, merges the
 *     guest's today's usage into the user's DailyUsage row, and clears the
 *     cookie.
 *
 * Lifecycle:
 *   - Set on the first unauthenticated request (regardless of path).
 *   - Lives for 7 days or until the browser clears cookies / server clears it
 *     on login/register.
 *   - Not set when a valid JWT is present (authenticated users use their userId).
 *
 * The cookie is HttpOnly (invisible to JS), Secure in production, SameSite=Lax,
 * scoped to the app root path. It carries no personal data — only a random ID
 * used for quota accounting.
 */

import crypto from "node:crypto";
import { env } from "../config/env.js";

export const GUEST_SESSION_COOKIE = "guest_session";

/**
 * Generate a new guest session ID (32 bytes of crypto randomness, hex-encoded).
 * @returns {string} 64-character hex string
 */
export function generateGuestSessionId() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Middleware: ensure every unauthenticated request has a guest session cookie.
 *
 * Attaches `req.guestSessionId` (string) when the request is unauthenticated
 * and has a guest session cookie (new or existing). When the request is
 * authenticated (req.user set by a prior middleware), `req.guestSessionId` is
 * left untouched so the quota middleware can tell the difference.
 *
 * IMPORTANT ordering in app.js:
 *   1. body parsing
 *   2. guestSessionMiddleware  <-- sets req.guestSessionId for guests
 *   3. auth middleware (requireAuth / attachOptionalUser)  <-- sets req.user
 *   4. quota middleware  <-- reads both req.user and req.guestSessionId
 */
export function guestSessionMiddleware(req, res, next) {
  // Authenticated requests: do NOT touch the guest cookie. The user's account
  // is the source of truth, and the guest→user transfer (if any) happens in
  // the auth controller after login/register.
  if (req.user) {
    return next();
  }

  // Parse the raw Cookie header ourselves (no cookie-parser dependency).
  const rawCookie = req.headers.cookie ?? "";
  const sessionId = parseCookie(rawCookie, GUEST_SESSION_COOKIE);

  if (sessionId) {
    req.guestSessionId = sessionId;
    return next();
  }

  // No existing session → issue a new one.
  const id = generateGuestSessionId();
  req.guestSessionId = id;

  // Set the HttpOnly cookie. Secure=false in dev/test so localhost works.
  const secure = env.nodeEnv === "production";
  res.setHeader(
    "Set-Cookie",
    cookieHeader(GUEST_SESSION_COOKIE, id, {
      MaxAge: Math.floor(7 * 24 * 60 * 60),
      Path: "/",
      HttpOnly: true,
      SameSite: "Lax",
      Secure: secure,
    }),
  );

  next();
}

/**
 * Clear the guest session cookie. Called by the auth controller after a
 * successful login/register when a guest→user quota transfer has been performed.
 */
export function clearGuestSession(res) {
  res.setHeader(
    "Set-Cookie",
    cookieHeader(GUEST_SESSION_COOKIE, "", {
      MaxAge: 0,
      Path: "/",
      HttpOnly: true,
      SameSite: "Lax",
      Secure: env.nodeEnv === "production",
    }),
  );
}

// ---- small cookie helpers (no runtime deps beyond node:crypto) ----

/**
 * Parse a single cookie name from a raw `Cookie` header value.
 * @param {string} header - raw Cookie header (may be empty).
 * @param {string} name - cookie name to extract.
 * @returns {string | undefined}
 */
function parseCookie(header, name) {
  if (!header) return undefined;
  const parts = header.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.toLowerCase().startsWith(name.toLowerCase() + "=")) {
      const value = trimmed.slice(name.length + 1);
      return value.length > 0 ? value : undefined;
    }
  }
  return undefined;
}

/**
 * Build a single `Set-Cookie` header value.
 * @param {string} name
 * @param {string} value
 * @param {Record<string, string | number | boolean>} opts
 * @returns {string}
 */
function cookieHeader(name, value, opts = {}) {
  const parts = [`${name}=${value}`];
  for (const [key, val] of Object.entries(opts)) {
    // Boolean flags (HttpOnly, Secure): include the bare flag only when true,
    // omit entirely when false. Key=value options (Path, Max-Age, SameSite)
    // are emitted as-is.
    if (typeof val === "boolean") {
      if (val) parts.push(key);
      continue;
    }
    if (val === undefined || val === null || val === "") continue;
    if (typeof val === "number") {
      parts.push(`${key}=${val}`);
      continue;
    }
    parts.push(`${key}=${val}`);
  }
  return parts.join("; ");
}