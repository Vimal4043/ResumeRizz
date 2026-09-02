import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { verifyToken } from "../utils/jwt.js";
import { User } from "../models/User.js";

/**
 * Extract the bearer token from the Authorization header.
 * Tokens are only accepted from headers — never from URLs or query strings.
 */
function extractToken(req) {
  const header = req.headers.authorization ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim() || null;
}

/**
 * Resolve the authenticated user for a request, or return null when the
 * request is unauthenticated. Returns null for a missing, invalid, expired, or
 * unknown-account token (never throws), so it is safe to call on public routes.
 */
async function resolveUser(req) {
  const token = extractToken(req);
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  const user = await User.findById(payload.sub);
  return user; // null when the account no longer exists
}

/**
 * Require a valid JWT. Attaches `req.user` (a full User document, with the
 * password hash excluded by the schema's `select: false`) on success.
 */
export async function requireAuth(req, _res, next) {
  try {
    const token = extractToken(req);
    if (!token) {
      throw new AppError(
        "Authentication required. Please log in.",
        401,
        "UNAUTHENTICATED",
      );
    }

    const payload = verifyToken(token);
    if (!payload) {
      throw new AppError(
        "Your session has expired. Please log in again.",
        401,
        "TOKEN_INVALID",
      );
    }

    const user = await User.findById(payload.sub);
    if (!user) {
      // Token valid but the account no longer exists.
      throw new AppError(
        "Account not found. Please log in again.",
        401,
        "USER_NOT_FOUND",
      );
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * OPTIONAL auth. Attaches `req.user` when a valid token is present, but never
 * rejects the request otherwise. Use on public routes where authentication
 * should be honored when available (e.g. so a logged-in user's analysis is
 * saved) but is not required (guests can still use the feature).
 *
 * `req.user` will be `undefined` for guests, `null` for an invalid/expired
 * token that we deliberately ignore, or a User document when authenticated.
 */
export async function attachOptionalUser(req, _res, next) {
  try {
    req.user = (await resolveUser(req)) || null;
  } catch {
    req.user = null; // never block an otherwise-public request
  }
  next();
}
