import { User } from "../models/User.js";
import { PendingSignup } from "../models/PendingSignup.js";
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
 * NEW FLOW (signup → OTP → verify → account):
 *   1. Validate input.
 *   2. If a real User with this email already exists → EMAIL_TAKEN (normal rejection).
 *   3. Otherwise, **upsert/replace** a PendingSignup row for this email (so an abandoned
 *      signup from a previous attempt is replaced with a fresh OTP, never "email already
 *      exists").
 *   4. Issue a 6-digit OTP, store its bcrypt hash on the pending record, send it by email.
 *   5. Return immediately. **No User is created. No token is issued.**
 *
 * The caller (Register.jsx) receives the email and should navigate straight to
 * /verify-email. If the email send fails (SMTP down, timeout, etc.) the frontend will
 * surface the error and the user can retry; no User record is orphaned.
 */
export async function register(req, res, next) {
  try {
    const { name, email, password } = parseCredentials(req.body, {
      requireName: true,
    });

    // 1. Real User with this email already exists → normal signup rejection.
    const existingUser = await User.findOne({ email }).lean();
    if (existingUser) {
      throw new AppError(
        "An account with this email already exists.",
        409,
        "EMAIL_TAKEN",
      );
    }

    // 2. Check if a pending signup already exists for this email. If so, we replace it
    //    with a fresh OTP instead of returning "email already exists". The user can
    //    always retry signup with the same email if they abandoned a previous attempt.
    const existingPending = await PendingSignup.findOne({ email }).lean();
    if (existingPending) {
      // There's an existing pending record — replace it with a fresh OTP instead of
      // returning "email already exists". The TTL index still cleans up if this one is
      // also abandoned.
      logger.info(
        "[ auth ] Replacing existing pending signup for %s (new attempt)",
        email,
      );
      await PendingSignup.deleteOne({ _id: existingPending._id });
    }

    // 3. Create (or recreate) the pending signup row. Password is hashed here so it's
    //    never stored in plaintext; it will be copied into the real User only after OTP
    //    verification succeeds.
    const passwordHash = await User.hashPassword(password);
    const pending = await PendingSignup.create({
      email,
      name,
      passwordHash,
      guestSessionId: req.guestSessionId ?? null,
      // Set expires to now + 24h so the TTL index cleans up abandoned signups
      // automatically. After that window the user must start signup over.
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    // 4. Issue OTP + send email. If this fails we do NOT create a User; the pending row
    //    can be cleaned up by the TTL index eventually, and the user can retry signup.
    const code = await pending.issueOtp();
    await sendOtpEmail(email, code);

    // 5. Respond immediately — no User, no token. The frontend navigates to
    //    /verify-email while the email is in flight (or already delivered).
    res.setHeader("Cache-Control", "no-store");
    sendSuccess(
      res,
      { pendingId: pending._id.toString(), email },
      "Account pre-registration complete. Please check your email for a verification code.",
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
 * NEW FLOW (verify OTP → create account):
 *   1. Validate input.
 *   2. Look for a **pending signup** for this email first.
 *      - If found: verify the OTP against the pending signup's stored hash.
 *        - If OTP is valid → create a real User from the pending signup, mark it
 *          verified, merge guest quota, clear guest cookie, and return a token + user.
 *        - If OTP is invalid/expired/locked → return an appropriate error.
 *   3. If no pending signup exists, fall back to the existing User-based flow
 *      (for backward compatibility with any existing unverified Users that might exist
 *      in the DB from before this change).
 *      - Look up a real User by email.
 *      - If found and OTP verifies → mark as verified, return user.
 *      - If not found → INVALID_CODE.
 *
 * This design ensures that:
 *   - A pending signup is ALWAYS verified first (new signups).
 *   - Any legacy unverified Users (from before this change) still work.
 *   - A User is NEVER created before OTP verification succeeds.
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

    // 1. Check for a pending signup first (new signups).
    const pending = await PendingSignup.findOne({ email: emailLower }).lean();
    if (pending) {
      const livePending = await PendingSignup.findById(pending._id);
      if (!livePending) {
        // Pending was cleaned up between the find and this call.
        throw new AppError(
          "Verification code is invalid or expired.",
          400,
          "INVALID_CODE",
        );
      }

      const result = await livePending.verifyOtp(code);
      if (!result.ok) {
        // Map the verification result reason to a user-friendly message.
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

      // OTP verified! Now create the real User from the pending signup.

      // Create the real User. At this point the OTP has been verified, so this is the
      // moment the account becomes "real" in the system.
      const passwordHash = livePending.passwordHash;
      if (!passwordHash) {
        throw new AppError("Pending signup has no password hash.", 400, "VALIDATION_ERROR");
      }

      const user = await User.create({
        name: livePending.name,
        email: emailLower,
        passwordHash,
      });

      // Mark as verified (the OTP just proved email ownership).
      user.isVerified = true;
      await user.save({ validateBeforeSave: false });

      // Merge guest→user quota BEFORE clearing the guest cookie.
      if (livePending.guestSessionId) {
        try {
          await mergeGuestUsage(livePending.guestSessionId, user._id.toString());
        } catch (mergeErr) {
          console.error("[ auth ] mergeGuestUsage failed after verify:", mergeErr.message);
        }
        clearGuestSession(res);
      }

      // Clean up the pending signup record since we've converted it to a real User.
      await PendingSignup.deleteOne({ _id: livePending._id });

      // Issue a session token for the newly created User.
      const { token, user: publicUser } = await issueSession(res, user);
      res.setHeader("Cache-Control", "no-store");
      sendSuccess(
        res,
        { token, user: publicUser, requiresVerification: false },
        "Email verified successfully. Your account has been created.",
        200,
      );
      return;
    }

    // 2. No pending signup — fall back to existing User-based flow.
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


/**
 * DELETE /api/auth/pending-signups/cleanup
 *
 * Manual cleanup endpoint for expired pending signups.
 * MongoDB's TTL index on `expires` already removes these documents automatically,
 * but this endpoint provides an explicit trigger and a way to monitor how many
 * abandoned signups get cleaned up.
 */
export async function cleanupExpiredPendingSignups(req, res, next) {
  try {
    const cutoff = new Date();
    const result = await PendingSignup.deleteMany({ expires: { $lte: cutoff } });
    sendSuccess(
      res,
      { deletedCount: result.deletedCount },
      "Expired pending signups cleaned up.",
    );
  } catch (err) {
    next(err);
  }
}
