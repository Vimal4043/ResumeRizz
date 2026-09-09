import { Router } from "express";
import {
  analyze,
  getHistory,
  getAnalysis,
  deleteAnalysis,
} from "../controllers/analysisController.js";
import { uploadMiddleware } from "../middleware/uploadMiddleware.js";
import { analysisQuota } from "../middleware/analysisQuotaMiddleware.js";
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
//   1. attachOptionalUser — resolves req.user so the quota middleware can split
//      guest (per-session, DB via DailyUsage) from authenticated (per-account, DB)
//      limits.
//   2. analysisQuota — enforces the cooldown and the daily cap for BOTH guests
//      and authenticated users, BEFORE upload so a rejected request never writes
//      a temp file. The daily cap counts only SUCCESSFUL analyses (guests:
//      DB-backed via DailyUsage by guest session ID; authed: Analysis documents),
//      so validation/AI/cooldown failures never consume quota.
//   3. uploadMiddleware — only requests that passed quota touch the disk.
router.post(
  "/",
  attachOptionalUser,
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
