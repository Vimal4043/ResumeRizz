import fs from "node:fs/promises";
import { env } from "../config/env.js";
import { AppError, ValidationError } from "../utils/errors.js";
import { sendSuccess } from "../utils/response.js";
import { logger } from "../utils/logger.js";
import { analysisService } from "../services/ai/analysisService.js";
import { recordGuestAnalysis } from "../middleware/analysisQuotaMiddleware.js";
import { Resume } from "../models/Resume.js";
import { Analysis } from "../models/Analysis.js";
import { User } from "../models/User.js";

/**
 * Minimum meaningful length for a job description.
 * Anything shorter is almost certainly a copy/paste error and not worth running
 * a full (rate-limited, paid) Gemini call.
 */
const MIN_JOB_DESCRIPTION_LENGTH = 40;

/**
 * POST /api/analysis
 *
 * Accepts a multipart form with:
 *   - resume: PDF file
 *   - jobDescription: free-text job description
 *
 * PUBLIC endpoint. Authentication is OPTIONAL (attachOptionalUser sets
 * req.user when a valid token is present, otherwise it is null):
 *   - Authenticated → runs the pipeline and, on success, saves the analysis
 *     (plus structured resume) to that user's account.
 *   - Guest → runs the same pipeline and returns the full result, but never
 *     persists anything to MongoDB (no anonymous account is created).
 *
 * Returns the canonical analysis object plus a `saved` flag (whether it was
 * persisted) and an `analysisId` when it was. The uploaded PDF is a temporary
 * working file and is always cleaned up (guest or not); the PDF is never stored.
 */
export async function analyze(req, res) {
  const filePath = req.file?.path;
  const isAuthenticated = Boolean(req.user);

  try {
    if (!req.file) {
      throw new ValidationError(
        "Please upload a PDF resume to continue.",
        "RESUME_REQUIRED",
      );
    }

    const jobDescription =
      typeof req.body?.jobDescription === "string"
        ? req.body.jobDescription.trim()
        : "";

    if (!jobDescription) {
      throw new ValidationError(
        "Please paste the job description before analyzing.",
        "JOB_DESCRIPTION_REQUIRED",
      );
    }

    if (jobDescription.length < MIN_JOB_DESCRIPTION_LENGTH) {
      throw new ValidationError(
        "The job description is too short to analyze reliably. Please paste the complete description.",
        "JOB_DESCRIPTION_TOO_SHORT",
      );
    }

    if (jobDescription.length > env.maxJobDescriptionLength) {
      throw new ValidationError(
        `The job description is too long (maximum ${env.maxJobDescriptionLength.toLocaleString()} characters). Please trim it and try again.`,
        "JOB_DESCRIPTION_TOO_LONG",
      );
    }

    const result = await analysisService.analyzeResume({
      resumeFile: req.file,
      jobDescription,
    });

    // Persist ONLY for authenticated users and only after a fully successful
    // analysis (never failed runs). Guests are never written to MongoDB and
    // never get an anonymous account. Persistence is best-effort: a failure
    // must not lose the user's just-completed result.
    let analysisId = null;
    if (isAuthenticated) {
      try {
        const resumeDoc = await Resume.create({
          userId: req.user._id,
          originalName: req.file.originalname,
          resumeText: result.resumeText,
          structuredResume: result.structuredResume,
        });
        const doc = await Analysis.create({
          userId: req.user._id,
          resume: resumeDoc._id,
          jobTitle: result.jobTitle,
          jobDescription,
          analysis: result.analysis,
          matchScore: result.analysis.matchScore,
        });
        analysisId = doc._id.toString();

        // Lightweight usage tracking (no billing): count analyses and keep the
        // last-analysis timestamp on the account. Best-effort — a tracking
        // failure must never lose the user's result. No resume/JD content is
        // recorded here.
        await User.findByIdAndUpdate(
          req.user._id,
          {
            $inc: { "usage.analysisCount": 1 },
            $set: { "usage.lastAnalysisAt": new Date() },
          },
        ).catch((trackErr) => {
          logger.warn(
            `Failed to update usage stats for user ${req.user._id}: ${trackErr.message}`,
          );
        });
      } catch (persistErr) {
        logger.error(
          `Failed to persist analysis for user ${req.user._id}: ${persistErr.message}`,
        );
      }
    }

    // Guest cooldown bookkeeping: only SUCCESSFUL analyses start the 10-minute
    // cooldown clock (a failed/invalid attempt never locks the user out).
    if (!isAuthenticated) {
      recordGuestAnalysis(req.ip);
    }

    return sendSuccess(
      res,
      {
        ...result.analysis,
        analysisId,
        saved: analysisId != null,
      },
      "Resume analysis completed",
    );
  } finally {
    // Always remove the temporary upload, regardless of success, failure, or
    // whether the caller was a guest or an authenticated user.
    if (filePath) {
      await fs.unlink(filePath).catch(() => {});
    }
  }
}

/**
 * GET /api/analysis/history
 *
 * Returns the authenticated user's analyses, newest first, paginated.
 * Query params: ?page=1&limit=10 (limit capped at 50).
 */
export async function getHistory(req, res) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));

  const [items, total] = await Promise.all([
    Analysis.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("resume", "originalName"),
    Analysis.countDocuments({ userId: req.user._id }),
  ]);

  return sendSuccess(res, {
    items: items.map((a) => ({
      ...a.toHistoryJSON(),
      resumeName: a.resume?.originalName ?? "",
    })),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  }, "Analysis history");
}

/**
 * GET /api/analysis/:id
 *
 * Returns one full analysis — only if it belongs to the authenticated user.
 * A foreign or nonexistent id yields the same 404 (no existence leak).
 */
export async function getAnalysis(req, res) {
  const doc = await Analysis.findOne({
    _id: req.params.id,
    userId: req.user._id, // ownership enforced in the query itself
  }).populate("resume", "originalName");

  if (!doc) {
    throw new AppError("Analysis not found.", 404, "NOT_FOUND");
  }

  return sendSuccess(res, {
    id: doc._id.toString(),
    jobTitle: doc.jobTitle,
    jobDescription: doc.jobDescription,
    matchScore: doc.matchScore,
    analysis: doc.analysis,
    resumeName: doc.resume?.originalName ?? "",
    createdAt: doc.createdAt,
  }, "Analysis retrieved");
}

/**
 * DELETE /api/analysis/:id
 *
 * Only the owner can delete. Foreign/nonexistent ids both yield 404.
 */
export async function deleteAnalysis(req, res) {
  const doc = await Analysis.findOneAndDelete({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!doc) {
    throw new AppError("Analysis not found.", 404, "NOT_FOUND");
  }

  // Remove the associated resume record too (it existed only for this analysis).
  await Resume.deleteOne({ _id: doc.resume, userId: req.user._id }).catch(
    () => {},
  );

  return sendSuccess(res, { id: doc._id.toString() }, "Analysis deleted");
}
