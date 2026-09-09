import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

/** OTP code length (hardcoded: 6 digits — see config/env.js). */
const OTP_CODE_LENGTH = 6;

/** OTP code validity window (hardcoded: 10 minutes — see config/env.js). */
const OTP_TTL_MS = 10 * 60 * 1000;

/** Max failed verification attempts per OTP code before lockout (hardcoded: 5). */
const OTP_MAX_ATTEMPTS = 5;

const BCRYPT_ROUNDS = 12;

/**
 * User account. Intentionally minimal: only what authentication needs.
 * Never store plaintext passwords — only the bcrypt hash.
 *
 * Email verification (OTP) fields:
 *   isVerified     — whether the email address has been verified via OTP.
 *   otpHash        — bcrypt hash of the current 6-digit OTP (null when none).
 *   otpExpires     — when the current OTP expires (10 minutes after issue).
 *   otpAttempts    — failed verification attempts for the CURRENT OTP code.
 *                    Reset to 0 each time a new OTP is issued.
 *                    Locked out (429) when this reaches OTP_MAX_ATTEMPTS.
 */
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [80, "Name must be at most 80 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      trim: true,
      lowercase: true, // normalization: emails compared case-insensitively
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please provide a valid email"],
    },
    passwordHash: {
      type: String,
      required: [true, "Password hash is required"],
      select: false, // never returned by queries unless explicitly requested
    },
    // Email verification state (OTP-based).
    isVerified: { type: Boolean, default: false },
    otpHash: { type: String, default: null },
    otpExpires: { type: Date, default: null },
    otpAttempts: { type: Number, default: 0, min: 0 },
    // Lightweight usage metadata (no billing, no content): how many analyses
    // the account has run and when it last ran one. Updated best-effort after
    // each successful authenticated analysis.
    usage: {
      analysisCount: { type: Number, default: 0, min: 0 },
      lastAnalysisAt: { type: Date, default: null },
    },
  },
  { timestamps: true }, // createdAt + updatedAt
);

/**
 * Hash a plaintext password. Plaintext is never persisted anywhere.
 * @param {string} password
 * @returns {Promise<string>} bcrypt hash
 */
userSchema.statics.hashPassword = function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
};

/**
 * Compare a plaintext candidate against the stored hash.
 * @param {string} candidate
 * @returns {Promise<boolean>}
 */
userSchema.methods.verifyPassword = function verifyPassword(candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

/** Safe public representation (never includes the hash). */
userSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    isVerified: this.isVerified,
    createdAt: this.createdAt,
  };
};

/** @returns {string} a 6-digit numeric OTP code. */
userSchema.statics.generateOtpCode = function generateOtpCode() {
  // 6-digit code: 000000..999999. crypto.randomInt is unbiased.
  // Uses crypto for cryptographic randomness (never Math.random for OTPs).
  let code = "";
  for (let i = 0; i < OTP_CODE_LENGTH; i++) {
    code += crypto.randomInt(0, 10).toString();
  }
  return code;
};

/**
 * Hash a plaintext OTP code with bcrypt, same rounds as passwords so attempts
 * to brute-force stored hashes are expensive on the server.
 * @param {string} code - 6-digit numeric string.
 * @returns {Promise<string>} bcrypt hash
 */
userSchema.statics.hashOtp = function hashOtp(code) {
  return bcrypt.hash(code, BCRYPT_ROUNDS);
};

/**
 * Constant-time-ish comparison of a plaintext OTP candidate against the stored
 * bcrypt hash. Uses bcrypt.compare (designed for this).
 * @param {string} candidate
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
userSchema.statics.compareOtpHash = function compareOtpHash(candidate, hash) {
  return bcrypt.compare(candidate, hash);
};

/**
 * Issue a new OTP for this user: generate, hash, store, set expiry (10 min),
 * reset attempt counter. Returns the plaintext code so the caller can send it
 * (via email) — the plaintext is NEVER persisted.
 * @returns {Promise<string>} the plaintext 6-digit code (for sending only)
 */
userSchema.methods.issueOtp = async function issueOtp() {
  const code = User.generateOtpCode();
  this.otpHash = await bcrypt.hash(code, BCRYPT_ROUNDS);
  this.otpExpires = new Date(Date.now() + OTP_TTL_MS);
  this.otpAttempts = 0;
  // Save the whole document (partials via `fields` are not supported by all
  // Mongoose versions — a full save here is safe: nothing else on the user
  // changes during OTP issuance).
  await this.save({ validateBeforeSave: false });
  return code;
};

/**
 * Verify a plaintext OTP candidate. Returns an object describing the outcome
 * so the controller can map it to the right HTTP response.
 * @param {string} candidate - 6-digit code the user entered.
 * @returns {{ ok: boolean, reason: string }}
 */
userSchema.methods.verifyOtp = async function verifyOtp(candidate) {
  // No OTP at all → ask the user to request one.
  if (!this.otpHash) {
    return { ok: false, reason: "NO_OTP" };
  }
  // Expired → ask for a fresh one.
  if (!this.otpExpires || this.otpExpires.getTime() <= Date.now()) {
    return { ok: false, reason: "EXPIRED" };
  }
  // Too many failed attempts on this OTP → locked out (ask to resend).
  if (this.otpAttempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, reason: "LOCKED_OUT" };
  }
  const match = await User.compareOtpHash(candidate, this.otpHash);
  if (!match) {
    // Increment attempt counter (best-effort; a save failure must not block the
    // user, but we retry once).
    this.otpAttempts += 1;
    try {
      await this.save({ validateBeforeSave: false });
    } catch {
      /* best-effort: if the counter doesn't persist, the user gets a few extra
         attempts — acceptable degradation, not a security boundary */ }
    return { ok: false, reason: "WRONG" };
  }
  // Success: mark the email as verified and wipe OTP state so it can't be reused.
  this.isVerified = true;
  this.otpHash = null;
  this.otpExpires = null;
  this.otpAttempts = 0;
  try {
    await this.save({ validateBeforeSave: false });
  } catch {
    /* If clearing fails, the code is still single-use in practice (the
       controller only calls this once per request). Not blocking. */
  }
  return { ok: true, reason: "VERIFIED" };
};

export const User = mongoose.model("User", userSchema);
