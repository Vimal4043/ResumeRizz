import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import {
  register,
  login,
  logout,
  getMe,
  sendOtp,
  verifyOtp,
  cleanupExpiredPendingSignups,
} from "../controllers/authController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { env } from "../config/env.js";

const router = Router();

// OTP brute-force / email-spam guards (IP-based):
// - /otp/send   → 3 requests per 10 minutes per IP (prevents email spam)
// - /otp/verify → 5 attempts per 10 minutes per IP (prevents code guessing)
const sendOtpLimiter = rateLimit({
  windowMs: env.sendOtpWindowMs,
  limit: env.sendOtpMax,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many OTP requests. Please try again later.",
  },
});
const verifyOtpLimiter = rateLimit({
  windowMs: env.verifyOtpWindowMs,
  limit: env.verifyOtpMax,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many verification attempts. Please try again later.",
  },
});

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);
router.get("/me", requireAuth, getMe);

// OTP endpoints
router.post("/otp/send", sendOtpLimiter, sendOtp);
router.post("/otp/verify", verifyOtpLimiter, verifyOtp);

// Cleanup endpoint for expired pending signups (TTL index handles this
// automatically, but this endpoint provides a manual trigger / monitoring hook).
router.delete("/pending-signups/cleanup", cleanupExpiredPendingSignups);

export default router;
