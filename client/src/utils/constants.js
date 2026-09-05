/** Accepted resume file type for uploads. */
export const ALLOWED_RESUME_TYPES = ["application/pdf"];

/** Maximum resume upload size in bytes (5 MB). */
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Contextual guidance for INPUT-related analysis errors (backend codes).
 * Rendered only when the failure was actually caused by the resume or the job
 * description — NEVER appended to AI/server/network errors.
 */
export const ANALYSIS_INPUT_ERROR_HINTS = {
  RESUME_REQUIRED: "Upload a resume to continue.",
  INVALID_FILE_TYPE: "Please upload a PDF resume.",
  FILE_TOO_LARGE: "Please upload a PDF smaller than 5 MB.",
  PDF_PARSE_FAILED:
    "Try re-exporting your resume as a PDF, then upload it again.",
  NO_EXTRACTABLE_TEXT:
    "Please upload a text-based PDF rather than a scanned image.",
  JOB_DESCRIPTION_REQUIRED: "Paste the full job description.",
  JOB_DESCRIPTION_TOO_SHORT: "Paste the complete job description.",
  JOB_DESCRIPTION_TOO_LONG: "Trim the job description and try again.",
};

/** True when the analysis failure was caused by the user's input (resume/JD). */
export function isInputError(code) {
  return Boolean(ANALYSIS_INPUT_ERROR_HINTS[code]);
}

/** Minimum number of characters the backend accepts for a job description. */
export const MIN_JOB_DESCRIPTION_LENGTH = 40;

/**
 * Maximum number of characters the backend accepts for a job description
 * (kept in sync with the server's MAX_JOB_DESCRIPTION_LENGTH, default 20000).
 */
export const MAX_JOB_DESCRIPTION_LENGTH = 20000;
