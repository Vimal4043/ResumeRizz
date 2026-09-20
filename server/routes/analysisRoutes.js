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

// POST /api/analysis is PUBLIC. Authentication is optional: when a valid token
// is present the analysis is saved to that account; guests simply get the
// result without persistence.
//
// Order matters:
//   1. attachOptionalUser — resolves req.user (so the controller can decide
//      whether to persist the result).
//   2. uploadMiddleware — parses the multipart PDF into a temp file.
//   3. analyze — runs the Gemini pipeline.
//
// NOTE: the daily analysis limit is enforced CLIENT-SIDE only (localStorage);
// the server deliberately enforces no analysis quota or cooldown.
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
