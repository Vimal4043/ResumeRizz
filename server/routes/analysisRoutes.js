import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import {
  analyze,
  getHistory,
  getAnalysis,
  deleteAnalysis,
} from "../controllers/analysisController.js";
import { uploadMiddleware } from "../middleware/uploadMiddleware.js";
import {
  requireAuth,
  attachOptionalUser,
} from "../middleware/authMiddleware.js";
import { env } from "../config/env.js";

const router = Router();

/**
 * Guest analysis rate limit.
 *
 * Running the analysis pipeline calls the (paid, rate-limited) Gemini API, so
 * we protect the free tier from obvious abuse. This limiter only counts
 * UNAUTHENTICATED requests (per IP); authenticated users skip it because their
 * requests are already throttled by the global /api limiter in app.js.
 *
 * The limiter sits BEFORE the upload middleware: a rejected request never
 * writes a temp file to disk.
 */
const guestAnalysisLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // rolling 15-minute window
  limit: env.guestAnalysisLimit, // guest analyses per IP per window
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: (req) => Boolean(req.user), // authenticated users are handled elsewhere
  message: {
    success: false,
    message:
      "You've used your free anonymous analyses for now. Please try again later or create a free account to keep analyzing.",
    code: "GUEST_ANALYSIS_LIMIT_REACHED",
  },
});

// POST /api/analysis is PUBLIC. Authentication is optional: when a valid token
// is present the analysis is saved to that account; guests simply get the
// result without persistence. attachOptionalUser must run before the limiter so
// authenticated requests can skip the stricter guest quota.
router.post(
  "/",
  attachOptionalUser,
  guestAnalysisLimiter,
  uploadMiddleware.single("resume"),
  analyze,
);

// Everything below loads user-owned data and REQUIRES authentication.
router.use(requireAuth);
router.get("/history", getHistory);
router.get("/:id", getAnalysis);
router.delete("/:id", deleteAnalysis);

export default router;
