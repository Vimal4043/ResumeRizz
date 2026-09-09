import { User } from "../models/User.js";
import { AppError } from "../utils/errors.js";
import { signToken } from "../utils/jwt.js";
import { sendSuccess } from "../utils/response.js";
import { sendOtpEmail } from "../utils/sendOtpEmail.js";
import { clearGuestSession } from "../middleware/guestSessionMiddleware.js";
import { mergeGuestUsage } from "../middleware/analysisQuotaMiddleware.js";
import { logger } from "../utils/logger.js";

const PASSWORD_MIN = 8;

function parseCredentials(body, { requireName = false } = {}) {
  const name = String(body?.name ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  if (requireName && (name.length < 2 || name.length > 80)) {
    throw new AppError("Name must be between 2 and 80 characters.", 400, "VALIDATION_ERROR");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError("Please provide a valid email address.", 400, "VALIDATION_ERROR");
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
 * After creating the account, the user is NOT marked as verified. They must
 * complete OTP verification (sent to their email) before they can use the
 * higher daily quota (AUTH_DAILY_ANALYSIS_LIMIT).
 */
export async function register(req, res, next) {
  try {
    const { name, email, password } = parseCredentials(req.body, {
      requireName: true,
    });

    const existing = await User.findOne({ email }).lean();
    if (existing) {
      throw new AppError(
        "An account with this email already exists.",
        409,
        "EMAIL_TAKEN",
      );
    }

    const passwordHash = await User.hashPassword(password);
    const user = await User.create({ name, email, passwordHash });

    // Merge guest→user quota BEFORE clearing the guest cookie.
    if (req.guestSessionId) {
      try {
        await mergeGuestUsage(req.guestSessionId, user._id.toString());
      } catch (mergeErr) {
        console.error("[ auth ] mergeGuestUsage failed after register:", mergeErr.message);
      }
      clearGuestSession(res);
    }

    // Issue and send OTP to verify the email.
    const code = await user.issueOtp();
    await sendOtpEmail(email, code);

    const { token, user: publicUser } = await issueSession(res, user);
    sendSuccess(
      res,
      { token, user: publicUser, requiresVerification: true },
      "Account created. Please check your email for a verification code.",
      201,
    );
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/login
 *
 * Rejects unverified accounts. After login, the guest→user quota merge happens
 * (if the request carried a guest session cookie).
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

    if (!user.isVerified) {
      throw new AppError(
        "Please verify your email address before logging in. Check your inbox for a verification code, or request a new one.",
        403,
        "EMAIL_NOT_VERIFIED",
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

// ---- OTP endpoints ----

/** Same payload parsing as login (email only, no password needed for OTP). */
function parseOtpEmail(body) {
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError(
      "Please provide a valid email address.",
      400,
      "VALIDATION_ERROR",
    );
  }
  return email;
}

/**
 * POST /api/auth/otp/send
 *
 * Issues a new 6-digit OTP for the given email and sends it via email (or logs
 * it in dev/test). Resets the per-code attempt counter.
 *
 * Rate-limited to 3 requests per 10 minutes per IP to prevent email spam.
 */
export async function sendOtp(req, res, next) {
  try {
    const email = parseOtpEmail(req.body);

    const user = await User.findOne({ email }).select("+passwordHash");
    if (!user) {
      // Do not reveal whether the email is registered. Behave the same as if
      // the email existed (an OTP "would have been sent").
      const code = User.generateOtpCode();
      await sendOtpEmail(email, code);
      res.setHeader("Cache-Control", "no-store");
      return sendSuccess(
        res,
        null,
        "If that email is registered, a verification code has been sent.",
      );
    }

    // Always issue a fresh OTP (even if one is pending) so the user gets a
    // current code. This also resets the attempt counter.
    const code = await user.issueOtp();
    await sendOtpEmail(email, code);

    res.setHeader("Cache-Control", "no-store");
    sendSuccess(
      res,
      null,
      "A verification code has been sent to your email.",
    );
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/otp/verify
 *
 * Verifies a 6-digit code against the stored hash. On success, marks the user
 * as verified (isVerified = true) and clears OTP state.
 *
 * Rate-limited to 5 attempts per 10 minutes per IP to prevent brute force.
 */
export async function verifyOtp(req, res, next) {
  try {
    const { email, code } = req.body;

    if (!email || typeof email !== "string") {
      throw new AppError(
        "Email is required.",
        400,
        "VALIDATION_ERROR",
      );
    }
    if (!code || typeof code !== "string" || !/^\d{6}$/.test(code)) {
      throw new AppError(
        "A 6-digit verification code is required.",
        400,
        "VALIDATION_ERROR",
      );
    }

    const emailLower = email.trim().toLowerCase();
    const user = await User.findOne({ email: emailLower }).select("+passwordHash");
    if (!user) {
      throw new AppError(
        "Verification code is invalid or expired.",
        400,
        "INVALID_CODE",
      );
    }

    const result = await user.verifyOtp(code);
    if (!result.ok) {
      const messages = {
        NO_OTP: "No verification code is pending. Request a new one.",
        EXPIRED: "The verification code has expired. Request a new one.",
        LOCKED_OUT: "Too many failed attempts. Please request a new code.",
        WRONG: "Invalid verification code.",
      };
      throw new AppError(
        messages[result.reason] ?? "Verification failed.",
        400,
        "INVALID_CODE",
      );
    }

    res.setHeader("Cache-Control", "no-store");
    sendSuccess(
      res,
      { user: user.toPublicJSON() },
      "Email verified successfully.",
    );
  } catch (err) {
    next(err);
  }
}
