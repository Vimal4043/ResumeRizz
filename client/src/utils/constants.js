/** Accepted resume file type for uploads. */
export const ALLOWED_RESUME_TYPES = ["application/pdf"];

/** Maximum resume upload size in bytes (5 MB). */
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/** Minimum number of characters the backend accepts for a job description. */
export const MIN_JOB_DESCRIPTION_LENGTH = 40;

/**
 * Ordered stages shown in the analysis progress UI while the request is in
 * flight. These describe high-level phases of the pipeline, not precise internal
 * progress — they advance with the request lifecycle, never a fake percentage.
 */
export const ANALYSIS_STEPS = [
  "Reading your resume",
  "Analyzing the job description",
  "Comparing your experience",
  "Identifying skill gaps",
  "Preparing recommendations",
];
