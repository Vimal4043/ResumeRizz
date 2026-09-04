import { Router } from "express";
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

const router = Router();

// Application-level analysis quota temporarily disabled.
// Re-enable after monitoring real usage and establishing production limits.
// The previous per-IP guest limiter and per-user authenticated limiter lived
// here (see git history for `guestAnalysisLimiter` /
// `authenticatedAnalysisLimiter`, configured via GUEST_ANALYSIS_LIMIT,
// GUEST_ANALYSIS_WINDOW_MINUTES, AUTH_ANALYSIS_LIMIT, AUTH_ANALYSIS_WINDOW_HOURS
// in config/env.js). Gemini's own provider-side rate limits are still honored
// and surfaced by services/ai/gemini.js — those are NOT bypassed.

// POST /api/analysis is PUBLIC. Authentication is optional: when a valid token
// is present the analysis is saved to that account; guests simply get the
// result without persistence.
router.post(
  "/",
  attachOptionalUser,
  uploadMiddleware.single("resume"),
  analyze,
);

// Everything below loads user-owned data and REQUIRES authentication.
router.use(requireAuth);
router.get("/history", getHistory);
router.get("/:id", getAnalysis);
router.delete("/:id", deleteAnalysis);

export default router;
