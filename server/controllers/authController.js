import { User } from "../models/User.js";
import { AppError } from "../utils/errors.js";
import { signToken } from "../utils/jwt.js";
import { sendSuccess } from "../utils/response.js";
import { clearGuestSession } from "../middleware/guestSessionMiddleware.js";
import { mergeGuestUsage } from "../middleware/analysisQuotaMiddleware.js";
import { logger } from "../utils/logger.js";

const PASSWORD_MIN = 8;
const EMAIL_MAX_LENGTH = 254;

/**
 * Authoritative, server-side syntactic email validation. This checks that the
 * address is well-formed — it does NOT (and cannot) prove the mailbox exists
 * or can receive mail. The frontend only does UX-level checks; this backend
 * validation is the source of truth.
 */
const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;

/**
 * Trim + lowercase-normalize an email and reject malformed addresses.
 * @param {unknown} raw
 * @returns {string} normalized email
 */
export function normalizeAndValidateEmail(raw) {
  const email = String(raw ?? "").trim().toLowerCase();
  if (
    !email ||
    email.length > EMAIL_MAX_LENGTH ||
    !EMAIL_REGEX.test(email)
  ) {
    throw new AppError(
      "Please provide a valid email address.",
      400,
      "VALIDATION_ERROR",
    );
  }
  return email;
}

function parseCredentials(body, { requireName = false } = {}) {
  const name = String(body?.name ?? "").trim();
  const email = normalizeAndValidateEmail(body?.email);
  const password = String(body?.password ?? "");
  if (requireName && (name.length < 2 || name.length > 80)) {
    throw new AppError("Name must be between 2 and 80 characters.", 400, "VALIDATION_ERROR");
  }
  if (password.length < PASSWORD_MIN) {
    throw new AppError(`Password must be at least ${PASSWORD_MIN} characters.`, 400, "VALIDATION_ERROR");
  }
  if (password.length > 128) {
    throw new AppError("Password is too long.", 400, "VALIDATION_ERROR");
  }
  return { name, email, password };
}

async function issueSession(res, user) {
  const token = signToken(user);
  res.setHeader("Cache-Control", "no-store");
  return { token, user: user.toPublicJSON() };
}

/**
 * POST /api/auth/register
 *
 * 1. Validate input (server-side email validation is authoritative).
 * 2. If a User with this email already exists → EMAIL_TAKEN.
 * 3. Otherwise create the User immediately and issue a session token.
 *
 * Guest→user quota merge happens (if the request carried a guest session).
 */
export async function register(req, res, next) {
  try {
    const { name, email, password } = parseCredentials(req.body, {
      requireName: true,
    });

    // Real User with this email already exists → normal signup rejection.
    const existingUser = await User.findOne({ email }).lean();
    if (existingUser) {
      throw new AppError(
        "An account with this email already exists.",
        409,
        "EMAIL_TAKEN",
      );
    }

    // Create the real User immediately. The password is hashed by the model
    // (bcrypt) before it's ever persisted.
    const passwordHash = await User.hashPassword(password);
    const user = await User.create({
      name,
      email,
      passwordHash,
    });

    // Merge guest→user quota BEFORE clearing the guest cookie.
    if (req.guestSessionId) {
      try {
        const transferred = await mergeGuestUsage(req.guestSessionId, user._id.toString());
        if (transferred > 0) {
          logger.info(
            `Merged ${transferred} guest analysis(es) into user ${user._id} after signup`,
          );
        }
      } catch (mergeErr) {
        console.error("[ auth ] mergeGuestUsage failed after register:", mergeErr.message);
      }
      clearGuestSession(res);
    }

    const { token, user: publicUser } = await issueSession(res, user);
    res.setHeader("Cache-Control", "no-store");
    sendSuccess(res, { token, user: publicUser }, "Account created", 201);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/login
 *
 * Normal email + password login. After login, the guest→user quota merge
 * happens (if the request carried a guest session cookie).
 */
export async function login(req, res, next) {
  try {
    const { email, password } = parseCredentials(req.body);

    const user = await User.findOne({ email }).select("+passwordHash");
    // Same generic message for unknown email and wrong password — no user
    // enumeration. Plaintext password is never logged.
    if (!user || !(await user.verifyPassword(password))) {
      throw new AppError(
        "Invalid email or password.",
        401,
        "INVALID_CREDENTIALS",
      );
    }

    // Merge guest→user quota BEFORE clearing the guest cookie.
    if (req.guestSessionId) {
      try {
        const transferred = await mergeGuestUsage(req.guestSessionId, user._id.toString());
        if (transferred > 0) {
          logger.info(
            `Merged ${transferred} guest analysis(es) into user ${user._id} after login`,
          );
        }
      } catch (mergeErr) {
        // Best-effort: a quota merge failure should not block login.
        console.error("[ auth ] mergeGuestUsage failed after login:", mergeErr.message);
      }
      clearGuestSession(res);
    }

    const { token, user: publicUser } = await issueSession(res, user);
    sendSuccess(res, { token, user: publicUser }, "Logged in");
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/logout
 *
 * Stateless JWT: the server cannot revoke a token it has issued, so logout is
 * a client-side token discard; this endpoint exists so the client has one
 * canonical call and any future server-side revocation (denylist) slots in.
 */
export async function logout(_req, res, next) {
  try {
    res.setHeader("Cache-Control", "no-store");
    sendSuccess(res, null, "Logged out");
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/me (requires auth middleware)
 */
export async function getMe(req, res, next) {
  try {
    sendSuccess(res, { user: req.user.toPublicJSON() }, "Current user");
  } catch (err) {
    next(err);
  }
}
