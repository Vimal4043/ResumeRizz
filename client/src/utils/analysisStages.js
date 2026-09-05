/**
 * Single source of truth for the analysis progress stages shown while an
 * analysis request is in flight.
 *
 * Each step describes a high-level, believable phase of the pipeline. The
 * frontend cannot observe Gemini's internal progress, so these stages are
 * advanced purely with elapsed wall-clock time (see `stageAtElapsed`) — they
 * never claim to mirror a specific backend operation at a specific moment and
 * never report a fake percentage.
 *
 * `durationMs` is how long the stage stays active before advancing. The final
 * stage has `durationMs: null` and holds indefinitely until the API responds
 * (rather than restarting the sequence on a slow request).
 */
export const ANALYSIS_STAGES = [
  { label: "Reading your resume", durationMs: 1200 },
  { label: "Extracting your experience", durationMs: 1200 },
  { label: "Understanding the job requirements", durationMs: 1300 },
  { label: "Identifying required skills", durationMs: 1400 },
  { label: "Identifying preferred skills", durationMs: 1400 },
  { label: "Mapping your experience to the role", durationMs: 1600 },
  { label: "Comparing your technical skills", durationMs: 1600 },
  { label: "Checking experience alignment", durationMs: 1800 },
  { label: "Looking for skill gaps", durationMs: 1900 },
  { label: "Reviewing keyword alignment", durationMs: 1900 },
  { label: "Evaluating project relevance", durationMs: 2000 },
  { label: "Reviewing resume clarity", durationMs: 2000 },
  { label: "Finding the highest-impact improvements", durationMs: 2200 },
  { label: "Generating personalized suggestions", durationMs: 2400 },
  { label: "Prioritizing what to fix first", durationMs: 2600 },
  { label: "Preparing your final report", durationMs: null },
];

/**
 * Returns the (zero-based) index of the stage that should be active after
 * `elapsedMs` has passed since the request started.
 *
 * Progression is strictly one-way: stages only advance forward, and the final
 * (holding) stage — the one with no `durationMs` — is held forever once
 * reached. This guarantees we never loop back to the start or repeat an earlier
 * stage on a slow request.
 *
 * @param {ReadonlyArray<{ label: string, durationMs: number | null }>} stages
 * @param {number} elapsedMs
 * @returns {number}
 */
export function stageAtElapsed(stages, elapsedMs) {
  let index = 0;
  let remaining = elapsedMs;
  for (let i = 0; i < stages.length; i++) {
    const duration = stages[i].durationMs;
    // The final (holding) stage has no duration: once we reach it we stay
    // here until the real API response arrives.
    if (duration == null) break;
    if (remaining >= duration) {
      remaining -= duration;
      index = i + 1;
    } else {
      break;
    }
  }
  const last = stages.length - 1;
  return Math.max(0, Math.min(index, last));
}

/** @returns {number} zero-based index of the final / holding stage. */
export function finalStageIndex(stages) {
  return Math.max(0, stages.length - 1);
}

/** @returns {boolean} whether `index` is at or past the final holding stage. */
export function isFinalStage(stages, index) {
  return index >= finalStageIndex(stages);
}
