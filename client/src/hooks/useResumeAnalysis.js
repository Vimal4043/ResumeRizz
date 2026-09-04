import { useCallback, useEffect, useRef, useState } from "react";
import { analyzeResume } from "../services/analysisService.js";
import { getAnalysisErrorMessage } from "../services/api.js";
import { ANALYSIS_STEPS } from "../utils/constants.js";

/**
 * Manages the state of a resume/job-description analysis run.
 *
 * status: 'idle' | 'loading' | 'success' | 'error'
 *
 * While loading, `stage` advances (cyclically) across the ANALYSIS_STEPS based on
 * the request lifecycle — not on fake percentage progress. It simply reflects
 * that the analysis is still in flight, and restarts from the first step on a new
 * run.
 */
export function useResumeAnalysis() {
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [stage, setStage] = useState(0);
  const timerRef = useRef(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => stopTimer(), [stopTimer]);

  const analyze = useCallback(
    async (resumeFile, jobDescription) => {
      stopTimer();
      setStatus("loading");
      setError(null);
      setResult(null);
      setStage(0);

      // Advance through the descriptive stages while the request is in flight.
      timerRef.current = setInterval(() => {
        setStage((current) => (current + 1) % ANALYSIS_STEPS.length);
      }, 2200);

      try {
        const data = await analyzeResume(resumeFile, jobDescription);
        stopTimer();
        setResult(data);
        setStatus("success");
        return data;
      } catch (err) {
        stopTimer();
        setError(getAnalysisErrorMessage(err));
        setStatus("error");
        throw err;
      }
    },
    [stopTimer],
  );

  const reset = useCallback(() => {
    stopTimer();
    setStatus("idle");
    setResult(null);
    setError(null);
    setStage(0);
  }, [stopTimer]);

  return { status, stage, result, error, analyze, reset };
}
