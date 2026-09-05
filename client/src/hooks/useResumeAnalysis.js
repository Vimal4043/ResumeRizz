import { useCallback, useEffect, useRef, useState } from "react";
import { analyzeResume } from "../services/analysisService.js";
import { getAnalysisError } from "../services/api.js";
import { ANALYSIS_STAGES, stageAtElapsed } from "../utils/analysisStages.js";

/**
 * Manages the state of a resume/job-description analysis run.
 *
 * status: 'idle' | 'loading' | 'success' | 'error'
 *
 * `error` is a structured object: { code, message, retryAfterSeconds } —
 * keyed off the backend's machine-readable error code, never message text.
 *
 * When the backend provides a retry hint (AI_RATE_LIMITED with
 * retryAfterSeconds > 0), `retrySecondsLeft` runs a live countdown; it reaches
 * 0 without any user action, at which point the UI re-enables the Analyze
 * button. When no hint is available, no countdown is shown (never faked).
 *
 * While loading, `stage` advances (one-way — never looping or repeating a
 * completed stage) through ANALYSIS_STAGES based on elapsed wall-clock time.
 * The frontend can't observe Gemini's internal progress, so these are UX
 * phases of the overall process, not a claim that a specific backend step is
 * running at that exact moment and never a fake percentage. The final stage
 * holds until the API responds.
 */
export function useResumeAnalysis() {
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null); // { code, message, retryAfterSeconds } | null
  const [retrySecondsLeft, setRetrySecondsLeft] = useState(0);
  const [stage, setStage] = useState(0);
  const timerRef = useRef(null);
  const countdownRef = useRef(null);
  const startTimeRef = useRef(0);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    stopTimer();
    stopCountdown();
  }, [stopTimer, stopCountdown]);

  const analyze = useCallback(
    async (resumeFile, jobDescription) => {
      stopTimer();
      stopCountdown();
      setRetrySecondsLeft(0);
      setStatus("loading");
      setError(null);
      setResult(null);
      setStage(0);

      startTimeRef.current = Date.now();

      // Advance one stage at a time based on elapsed wall-clock time. These
      // are UX-oriented phases (the frontend can't observe Gemini's internal
      // progress), advanced strictly forward — never looping back or repeating
      // an earlier stage. Once the final stage is reached it holds until the
      // API responds, rather than restarting the sequence on a slow request.
      timerRef.current = setInterval(() => {
        setStage((current) => {
          const next = stageAtElapsed(
            ANALYSIS_STAGES,
            Date.now() - startTimeRef.current,
          );
          return next > current ? next : current;
        });
      }, 300);

      try {
        const data = await analyzeResume(resumeFile, jobDescription);
        stopTimer();
        setResult(data);
        setStatus("success");
        return data;
      } catch (err) {
        stopTimer();
        const analysisError = getAnalysisError(err);
        setError(analysisError);
        setStatus("error");

        // Live countdown only when the server says how long to wait.
        if (analysisError.retryAfterSeconds > 0) {
          setRetrySecondsLeft(analysisError.retryAfterSeconds);
          stopCountdown();
          countdownRef.current = setInterval(() => {
            setRetrySecondsLeft((left) => {
              if (left <= 1) {
                stopCountdown();
                return 0; // countdown over → UI re-enables the button
              }
              return left - 1;
            });
          }, 1000);
        }
        throw err;
      }
    },
    [stopTimer, stopCountdown],
  );

  const reset = useCallback(() => {
    stopTimer();
    stopCountdown();
    setRetrySecondsLeft(0);
    setStatus("idle");
    setResult(null);
    setError(null);
    setStage(0);
  }, [stopTimer, stopCountdown]);

  return { status, stage, result, error, retrySecondsLeft, analyze, reset };
}
