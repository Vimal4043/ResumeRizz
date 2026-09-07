/**
 * Single source of truth for the loading UX while an analysis request is in
 * flight.
 *
 * The user sees ONE message at a time — no step counts, no checklist, no
 * percentage. The frontend cannot observe Gemini's internal progress, so these
 * messages are UX-oriented copy that describe the overall process, NOT a claim
 * that a specific backend operation is happening at that exact moment.
 *
 * While the main messages are being shown they rotate one at a time. Once every
 * main message has appeared, rotation continues through a separate pool of
 * neutral messages — the sequence never visibly restarts from the first message.
 */

// Messages shown during the first rotation. Each is a believable, professional
// description of a phase of the analysis. No filler ("Thinking...", "Processing..."...).
export const ANALYSIS_MESSAGES = [
  "Reading your resume...",
  "Understanding your experience...",
  "Reviewing the job requirements...",
  "Identifying important skills...",
  "Comparing your background with the role...",
  "Checking experience alignment...",
  "Looking for relevant evidence...",
  "Finding potential skill gaps...",
  "Reviewing keyword relevance...",
  "Evaluating project relevance...",
  "Looking for high-impact improvements...",
  "Preparing personalized recommendations...",
  "Finalizing your analysis...",
];

// Neutral fallback messages used only after all ANALYSIS_MESSAGES have been
// shown. They keep the user informed without repeating the main sequence.
export const NEUTRAL_MESSAGES = [
  "Still analyzing your resume...",
  "Refining the recommendations...",
  "Making the results more useful...",
];

/**
 * Returns the message string to display for a given zero-based stage index.
 *
 * Indices 0..(ANALYSIS_MESSAGES.length - 1) map to the main messages. Beyond
 * that, the index wraps into NEUTRAL_MESSAGES so the UI never restarts from
 * the first main message on a long-running request.
 *
 * @param {number} stage zero-based stage index (never goes backwards)
 * @returns {string} the single message to display right now
 */
export function messageForStage(stage) {
  if (stage < 0) return ANALYSIS_MESSAGES[0];
  if (stage < ANALYSIS_MESSAGES.length) return ANALYSIS_MESSAGES[stage];
  const offset = stage - ANALYSIS_MESSAGES.length;
  return NEUTRAL_MESSAGES[offset % NEUTRAL_MESSAGES.length];
}

/** @returns {number} zero-based index of the last main message. */
export function finalMainMessageIndex() {
  return ANALYSIS_MESSAGES.length - 1;
}
