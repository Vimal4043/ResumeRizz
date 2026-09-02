import mongoose from "mongoose";

/**
 * Resume record. Privacy-first: only structured content extracted from the
 * uploaded PDF is stored — the PDF file itself is always deleted right after
 * processing and is never persisted.
 */
const resumeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    originalName: { type: String, required: true, maxlength: 255 },
    // Raw extracted text, capped so a pathological resume cannot bloat the DB.
    resumeText: { type: String, required: true, maxlength: 100_000 },
    structuredResume: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

export const Resume = mongoose.model("Resume", resumeSchema);
