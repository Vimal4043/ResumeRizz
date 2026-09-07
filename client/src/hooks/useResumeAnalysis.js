import { useCallback, useEffect, useRef, useState } from "react";
import { analyzeResume } from "../services/analysisService.js";
import { getAnalysisError } from "../services/api.js";

/**
 * Rotation timing for the loading message. A small random variation keeps the
 * cadence natural rather than robotic. The interval is bounded to roughly
 * 2.6s3.4s; tests advance fake timers by at least 3.4s per tick to guarantee
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

// A cooldown's wait must survive a page refresh/reload, so its expiry is
// persisted to localStorage and restored on mount from the server-provided
// remaining time. A single timestamp is enough: remaining = expiry - now.
const COOLDOWN_KEY = "resumerizz_cooldown_until";

function loadCooldownExpiry() {
  try {
    const raw = localStorage.getItem(COOLDOWN_KEY);
    if (!raw) return null;
    const until = Number(raw);
    if (!Number.isFinite(until)) return null;
    return until;
  } catch {
    return null;
  }
}

function storeCooldownExpiry(seconds) {
  try {
    localStorage.setItem(COOLDOWN_KEY, String(Date.now() + seconds * 1000));
  } catch {
    /* storage unavailable (private mode)  fall back to in-session only */
  }
}

function clearCooldownStorage() {
  try {
    localStorage.removeItem(COOLDOWN_KEY);
  } catch {
    /* ignore */
  }
}

function makeCooldownError(seconds) {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return {
    code: "ANALYSIS_COOLDOWN",
    message: `Please wait about ${minutes} more minute${minutes > 1 ? "s" : ""} between analyses.`,
    retryAfterSeconds: seconds,
  };
}

/**
 * Manages the state of a resume/job-description analysis run.
 *
 * status: 'idle' | 'loading' | 'success' | 'error'
 *
 * `error` is a structured object: { code, message, retryAfterSeconds } 
 * keyed off the backend's machine-readable error code, never message text.
 *
 * When the backend provides a retry hint (AI_RATE_LIMITED with
 * retryAfterSeconds > 0), `retrySecondsLeft` runs a live countdown; it reaches
 * 0 without any user action, at which point the UI re-enables the Analyze
 * button. When no hint is available, no countdown is shown (never faked).
 *
 * While loading, `stage` is a zero-based index that advances one step at a time
 * through the message list. The frontend can't observe Gemini's internal
 * progress, so the message is UX-oriented copy  not a claim that a specific
 * backend step is running at that exact moment, and never a fake percentage.
 * The sequence is strictly one-way: it never loops back or repeats an earlier
 * message. After the main messages are exhausted, messageForStage() wraps into
 * a neutral pool, so the user never sees the first message again. On success or
 * error the timer stops immediately so the loading animation never lingers
 * behind the result or error.
 */
export function useResumeAnalysis() {
  // Read any persisted cooldown once, during render (lazy initializer  no
  // setState-in-effect). Its value seeds the initial error/status/remaining.
  const [restoredCooldown] = useState(() => {
    const until = loadCooldownExpiry();
    if (until == null) return null;
    const remainingMs = until - Date.now();
    if (remainingMs <= 0) {
      clearCooldownStorage();
      return null;
    }
    return Math.ceil(remainingMs / 1000);
  });

  const [status, setStatus] = useState(() =>
    restoredCooldown != null ? "error" : "idle",
  );
  const [result, setResult] = useState(null);
  const [error, setError] = useState(() =>
    restoredCooldown != null ? makeCooldownError(restoredCooldown) : null,
  ); // { code, message, retryAfterSeconds } | null
  const [retrySecondsLeft, setRetrySecondsLeft] = useState(
    () => restoredCooldown ?? 0,
  );
  const [stage, setStage] = useState(0);
  const timerRef = useRef(null);
  const countdownRef = useRef(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  // Wire up the countdown ticking interval. Callers set retrySecondsLeft
  // themselves; the interval's setState calls fire asynchronously (1s later),
  // never synchronously during an effect.
  const beginCooldownInterval = useCallback(() => {
    stopCountdown();
    countdownRef.current = setInterval(() => {
      setRetrySecondsLeft((left) => {
        if (left <= 1) {
          stopCountdown();
          clearCooldownStorage();
          setError(null); // remove the cooldown message
          setStatus("idle"); // allow a new analysis
          return 0;
        }
        return left - 1;
      });
    }, 1000);
  }, [stopCountdown]);

  // Begin (or restart) a cooldown countdown. Persists the expiry so the wait
  // continues after a refresh; clears the stored value once it elapses.
  const startCooldown = useCallback(
    (seconds) => {
      storeCooldownExpiry(seconds);
      setRetrySecondsLeft(seconds);
      beginCooldownInterval();
    },
    [beginCooldownInterval],
  );

  // Restore an in-progress cooldown after a page refresh/reload. The remaining
  // seconds were read during render (lazy initializer) and already seed
  // error/status/retrySecondsLeft; this effect only starts the ticking.
  useEffect(() => {
    if (restoredCooldown == null) return;
    beginCooldownInterval();
  }, [restoredCooldown, beginCooldownInterval]);

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

      // Rotate one message at a time. Each tick schedules the next with a
      // slightly varied interval so the cadence feels natural. The index only
      // ever increases  never decrements  so messages advance strictly forward.
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
        setResult(data);
        setStatus("success");
        return data;
      } catch (err) {
        stopTimer();
        const analysisError = getAnalysisError(err);
        setError(analysisError);
        setStatus("error");

        // Live countdown only when the server says how long to wait. The
        // expiry is persisted so the wait survives a page refresh/reload.
        if (analysisError.retryAfterSeconds > 0) {
          startCooldown(analysisError.retryAfterSeconds);
        }
        throw err;
      }
    },
    [stopTimer, stopCountdown, startCooldown],
  );

  const reset = useCallback(() => {
    stopTimer();
    stopCountdown();
    clearCooldownStorage();
    setRetrySecondsLeft(0);
    setStatus("idle");
    setResult(null);
    setError(null);
    setStage(0);
  }, [stopTimer, stopCountdown]);

  return { status, stage, result, error, retrySecondsLeft, analyze, reset };
}
