import { Router } from "express";
import {
  analyze,
  getHistory,
  getAnalysis,
  deleteAnalysis,
} from "../controllers/analysisController.js";
import { uploadMiddleware } from "../middleware/uploadMiddleware.js";
import {
  guestDailyAnalysisLimiter,
  analysisQuota,
} from "../middleware/analysisQuotaMiddleware.js";
import {
  requireAuth,
  attachOptionalUser,
} from "../middleware/authMiddleware.js";

const router = Router();

// POST /api/analysis is PUBLIC. Authentication is optional: when a valid token
// is present the analysis is saved to that account; guests simply get the
// result without persistence.
//
// Quota order matters:
//   1. attachOptionalUser — resolves req.user so the guest limiter can skip
//      authenticated requests (they're capped per account instead).
//   2. guestDailyAnalysisLimiter — 5/day per IP for guests (before upload, so
//      rejected requests never write a temp file).
//   3. analysisQuota — the 10-minute cooldown (everyone) and the per-account
//      20/day cap for authenticated users.
//   4. uploadMiddleware — only requests that passed quota touch the disk.
router.post(
  "/",
  attachOptionalUser,
  guestDailyAnalysisLimiter,
  analysisQuota,
  uploadMiddleware.single("resume"),
  analyze,
);

// Everything below loads user-owned data and REQUIRES authentication.
router.use(requireAuth);
router.get("/history", getHistory);
router.get("/:id", getAnalysis);
router.delete("/:id", deleteAnalysis);

export default router;
