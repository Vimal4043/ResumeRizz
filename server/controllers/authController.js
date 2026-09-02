import { User } from "../models/User.js";
import { AppError } from "../utils/errors.js";
import { signToken } from "../utils/jwt.js";
import { sendSuccess } from "../utils/response.js";

const PASSWORD_MIN = 8;

/** Validate + normalize registration/login payload. Throws AppError(400). */
function parseCredentials(body, { requireName = false } = {}) {
  const name = String(body?.name ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

  if (requireName && (name.length < 2 || name.length > 80)) {
    throw new AppError(
      "Name must be between 2 and 80 characters.",
      400,
      "VALIDATION_ERROR",
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError(
      "Please provide a valid email address.",
      400,
      "VALIDATION_ERROR",
    );
  }
  if (password.length < PASSWORD_MIN) {
    throw new AppError(
      `Password must be at least ${PASSWORD_MIN} characters.`,
      400,
      "VALIDATION_ERROR",
    );
  }
  if (password.length > 128) {
    throw new AppError("Password is too long.", 400, "VALIDATION_ERROR");
  }
  return { name, email, password };
}

async function issueSession(res, user) {
  const token = signToken(user);
  // Token is returned in the JSON body only — never in a URL or a cookie that
  // other origins could read. The client stores it in memory/localStorage.
  res.setHeader("Cache-Control", "no-store");
  return { token, user: user.toPublicJSON() };
}

/**
 * POST /api/auth/register
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

    const { token, user: publicUser } = await issueSession(res, user);
    sendSuccess(res, { token, user: publicUser }, "Account created", 201);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/login
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
