import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";
import { getClientIp } from "../middleware/clientIp.js";
import {
  register,
  login,
  logout,
  getMe,
} from "../controllers/authController.js";
import { requireAuth } from "../middleware/authMiddleware.js";

// Registration throttle: mitigates credential-stuffing / account-creation
// abuse. Keyed by the spoof-resistant client IP (direct peer wins; XFF is
// honored only behind a private/loopback socket peer). Skipped in NODE_ENV=test
// to keep the test suites deterministic.
const registerLimiter = rateLimit({
  windowMs: env.registerLimitWindowMs,
  max: env.registerLimitCount,
  keyGenerator: (req) => getClientIp(req),
  skip: () => env.nodeEnv === "test",
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, res, _next) => {
    res.status(429).json({
      success: false,
      message: "Too many account creations from this IP. Please try again later.",
      error: { code: "TOO_MANY_REGISTER" },
    });
  },
});

const router = Router();

router.post("/register", registerLimiter, register);
router.post("/login", login);
router.post("/logout", logout);
router.get("/me", requireAuth, getMe);

export default router;

