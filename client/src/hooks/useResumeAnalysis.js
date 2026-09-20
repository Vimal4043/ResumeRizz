import { useCallback, useEffect, useRef, useState } from "react";
import { analyzeResume } from "../services/analysisService.js";
import { getAnalysisError } from "../services/api.js";
import {
  ANALYSIS_LIMIT_MESSAGE,
  analysisLimitError,
  hasUsedToday,
  markAnalysisUsed,
} from "../utils/analysisLimit.js";

/**
 * Rotation timing for the loading message. A small random variation keeps the
 * cadence natural rather than robotic. The interval is bounded to roughly
 * 3.6s-4.4s; tests advance fake timers by at least 4.4s per tick to guarantee
 * a rotation.
 */
const BASE_LOADING_MESSAGE_INTERVAL_MS = 4000;
const LOADING_MESSAGE_INTERVAL_VARIATION_MS = 400;

function randomInterval() {
  return (
    BASE_LOADING_MESSAGE_INTERVAL_MS +
    (Math.random() * 2 - 1) * LOADING_MESSAGE_INTERVAL_VARIATION_MS
  );
}

/**
 * Manages the state of a resume/job-description analysis run.
 *
 * status: 'idle' | 'loading' | 'success' | 'error'
 *
 * The daily analysis limit is enforced CLIENT-SIDE only, in localStorage, keyed
 * separately for guests and authenticated users. The backend does not enforce
 * Check BEFORE the request is sent; record only AFTER a successful analysis.
 * A failed or errored request never consumes the limit. Stale (previous UTC
 * day) records are removed automatically and the analysis is allowed again.
 *
 * `error` is a structured object: { code, message, retryAfterSeconds } keyed off
 * the backend's machine-readable error code, never message text. When the local
 * limit blocks an attempt, `code` is ANALYSIS_LIMIT_REACHED.
 *
 * While loading, `stage` is a zero-based index that advances one step at a time
 * through the message list. The frontend can't observe Gemini's internal
 * progress, so the message is UX-oriented copy - not a claim that a specific
 * backend step is running at that exact moment, and never a fake percentage.
 * The sequence is strictly one-way: it never loops back or repeats an earlier
 * message. After the main messages are exhausted, messageForStage() wraps into
 * a neutral pool, so the user never sees the first message again. On success or
 * error the timer stops immediately so the loading animation never lingers
 * behind the result or error.
 *
 * @param {string|null|undefined} [userId] - signed-in user id (null = guest).
 */
export function useResumeAnalysis(userId = null) {
  const [status, setStatus] = useState("idle");
  const [stage, setStage] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null); // { code, message } | null
  // Whether today's analysis is already used for THIS identity. Seeded from
  // localStorage and refreshed whenever the identity changes (guest <-> account).
  const [limitReached, setLimitReached] = useState(() => hasUsedToday(userId));

  const timerRef = useRef(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Keep the limit state in sync when the identity changes: guests and accounts
  // use separate keys, so switching identity must re-evaluate the limit.
  useEffect(() => {
    setLimitReached(hasUsedToday(userId));
  }, [userId]);

  useEffect(() => () => stopTimer(), [stopTimer]);

  const analyze = useCallback(
    async (resumeFile, jobDescription) => {
      // 1. Enforce the client-side daily limit BEFORE any network request.
      if (hasUsedToday(userId)) {
        setLimitReached(true);
        setError(analysisLimitError());
        setStatus("error");
        throw new Error(ANALYSIS_LIMIT_MESSAGE);
      }

      stopTimer();
      setStatus("loading");
      setError(null);
      setResult(null);
      setStage(0);

      // Rotate one message at a time. Each tick schedules the next with a
      // slightly varied interval so the cadence feels natural. The index only
      // ever increases - never decrements - so messages advance strictly forward.
      // After the main message list is exhausted, messageForStage() wraps into
      // the neutral pool, so the user never sees the first message again.
      const scheduleNext = () => {
        timerRef.current = setTimeout(() => {
          setStage((current) => current + 1);
          scheduleNext();
        }, randomInterval());
      };
      scheduleNext();

      try {
        const data = await analyzeResume(resumeFile, jobDescription);
        stopTimer();
        // 2. Only a SUCCESSFUL analysis consumes the daily limit.
        markAnalysisUsed(userId);
        setLimitReached(true);
        setResult(data);
        setStatus("success");
        return data;
      } catch (err) {
        stopTimer();
        setError(getAnalysisError(err));
        setStatus("error");
        throw err;
      }
    },
    [stopTimer, userId],
  );

  const reset = useCallback(() => {
    stopTimer();
    setStatus("idle");
    setResult(null);
    setError(null);
    setStage(0);
  }, [stopTimer]);

  return { status, stage, result, error, limitReached, analyze, reset };
}
