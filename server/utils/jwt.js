/**
 * Token issuance and verification. JWT_SECRET comes from the environment and
 * is never logged, serialized, or sent to the client.
 */
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";

const TOKEN_TTL = "7d";

/**
 * Sign an access token for a user.
 * @param {{ id: string }} user
 * @returns {string}
 */
export function signToken(user) {
  if (!env.jwtSecret) {
    throw new AppError(
      "JWT_SECRET is not configured on the server",
      500,
      "SERVER_MISCONFIGURED",
    );
  }
  return jwt.sign({ sub: user.id ?? user._id?.toString() }, env.jwtSecret, {
    expiresIn: TOKEN_TTL,
  });
}

/**
 * Verify a token and return its payload, or null when invalid/expired.
 * @param {string} token
 * @returns {{ sub: string } | null}
 */
export function verifyToken(token) {
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    return typeof payload?.sub === "string" ? payload : null;
  } catch {
    return null;
  }
}
