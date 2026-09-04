import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

/**
 * User account. Intentionally minimal: only what authentication needs.
 * Never store plaintext passwords — only the bcrypt hash.
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
    createdAt: this.createdAt,
  };
};

export const User = mongoose.model("User", userSchema);
