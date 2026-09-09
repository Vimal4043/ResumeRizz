import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

/** OTP code length (must match User model). */
const OTP_CODE_LENGTH = 6;

/** OTP code validity window (must match User model: 10 minutes). */
const OTP_TTL_MS = 10 * 60 * 1000;

/** Max failed verification attempts per OTP code before lockout (must match User model). */
const OTP_MAX_ATTEMPTS = 5;

/** BCrypt rounds for OTP hashing — match the User model. */
const BCRYPT_ROUNDS = 12;

/**
 * Roughly 24 hours after creation, MongoDB's TTL index automatically removes
 * the document. This is the maximum window in which a pending signup can still
 * be verified; after that the signup is considered abandoned and the user must
 * start over.
 */
const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

const pendingSignupSchema = new mongoose.Schema(
  {
    /** Lowercase email address (unique — only one pending signup per email). */
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please provide a valid email"],
    },
    /** Display name from the signup form. */
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [80, "Name must be at most 80 characters"],
    },
    /** bcrypt hash of the signup password (never plaintext). */
    passwordHash: {
      type: String,
      required: true,
    },
    /** Hash of the current 6-digit OTP (null when none is pending). */
    otpHash: { type: String, default: null },
    /** When the current OTP expires (10 min after issue). */
    otpExpires: { type: Date, default: null },
    /** Failed verification attempts for the CURRENT OTP code. */
    otpAttempts: { type: Number, default: 0, min: 0 },
    /**
     * Guest session ID to merge into the real User once verification succeeds.
     * Copied from `req.guestSessionId` at signup time.
     */
    guestSessionId: { type: String, default: null },
    /**
     * When the pending signup record was created. TTL index deletes documents
     * whose `expires` timestamp has passed.
     */
    expires: { type: Date, default: null },
  },
  { timestamps: true },
);

// ---- schema-level indexes ----
// Unique email: only one pending signup per address at any time.
pendingSignupSchema.index({ email: 1 }, { unique: true, background: false });
// TTL: MongoDB automatically deletes documents whose `expires` value has passed.
pendingSignupSchema.index({ expires: 1 }, { expireAfterSeconds: 0, background: false });

/** Safe public representation (never includes the password hash). */
pendingSignupSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id.toString(),
    email: this.email,
    name: this.name,
    createdAt: this.createdAt,
  };
};

/**
 * Hash a plaintext OTP code with bcrypt (same rounds as passwords, matching User model).
 * @param {string} code - 6-digit numeric string.
 * @returns {Promise<string>} bcrypt hash
 */
pendingSignupSchema.statics.hashOtp = function hashOtp(code) {
  return bcrypt.hash(code, BCRYPT_ROUNDS);
};

/**
 * Generate a 6-digit numeric OTP code using crypto (never Math.random).
 * @returns {string} a 6-digit numeric string.
 */
pendingSignupSchema.statics.generateOtpCode = function generateOtpCode() {
  let code = "";
  for (let i = 0; i < OTP_CODE_LENGTH; i++) {
    code += crypto.randomInt(0, 10).toString();
  }
  return code;
};

/**
 * Issue a new OTP for this pending signup: generate, hash, store, set expiry,
 * reset attempt counter. Returns the plaintext code (for sending only).
 * @returns {Promise<string>} the plaintext 6-digit code.
 */
pendingSignupSchema.methods.issueOtp = async function issueOtp() {
  const code = PendingSignup.generateOtpCode();
  this.otpHash = await PendingSignup.hashOtp(code);
  this.otpExpires = new Date(Date.now() + OTP_TTL_MS);
  this.otpAttempts = 0;
  await this.save({ validateBeforeSave: false });
  return code;
};

/**
 * Verify a plaintext OTP candidate. Returns outcome object.
 * @param {string} candidate - 6-digit code.
 * @returns {{ ok: boolean, reason: string }}
 */
pendingSignupSchema.methods.verifyOtp = async function verifyOtp(candidate) {
  if (!this.otpHash) {
    return { ok: false, reason: "NO_OTP" };
  }
  if (!this.otpExpires || this.otpExpires.getTime() <= Date.now()) {
    return { ok: false, reason: "EXPIRED" };
  }
  if (this.otpAttempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, reason: "LOCKED_OUT" };
  }
  const match = await bcrypt.compare(candidate, this.otpHash);
  if (!match) {
    this.otpAttempts += 1;
    try {
      await this.save({ validateBeforeSave: false });
    } catch {
      /* best-effort */
    }
    return { ok: false, reason: "WRONG" };
  }
  return { ok: true, reason: "VERIFIED" };
};

const PendingSignup = mongoose.model("PendingSignup", pendingSignupSchema);

export { PendingSignup };
