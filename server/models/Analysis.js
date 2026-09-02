import mongoose from "mongoose";

/**
 * A completed resume ↔ job-description analysis. Failed analyses are never
 * saved. Every query for these records must filter by userId — ownership is
 * enforced in the controller, never in the UI alone.
 */
const analysisSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    resume: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resume",
      required: true,
    },
    // Best-effort title parsed from the JD (may be empty for unstructured JDs).
    jobTitle: { type: String, default: "", maxlength: 200 },
    // The JD text as submitted (trimmed). Kept so an analysis can be reviewed.
    jobDescription: { type: String, required: true, maxlength: 50_000 },
    // The full canonical analysis object (matchScore, strengths, ...).
    analysis: { type: mongoose.Schema.Types.Mixed, required: true },
    // Denormalized for history listing without loading the full analysis.
    matchScore: { type: Number, required: true, min: 0, max: 100 },
  },
  { timestamps: true }, // createdAt + updatedAt
);

// History listing: newest first per user.
analysisSchema.index({ userId: 1, createdAt: -1 });

/** Fields safe to return in history lists (no full JD, no full analysis). */
analysisSchema.methods.toHistoryJSON = function toHistoryJSON() {
  return {
    id: this._id.toString(),
    jobTitle: this.jobTitle,
    matchScore: this.matchScore,
    matchSummary: this.analysis?.matchSummary ?? "",
    createdAt: this.createdAt,
  };
};

export const Analysis = mongoose.model("Analysis", analysisSchema);
