import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { useResumeAnalysis } from "./useResumeAnalysis";
import * as analysisService from "../services/analysisService";
import {
  ANALYSIS_LIMIT_CODE,
  ANALYSIS_LIMIT_MESSAGE,
  GUEST_ANALYSIS_USED_KEY,
} from "../utils/analysisLimit";
import {
  ANALYSIS_MESSAGES,
  NEUTRAL_MESSAGES,
  messageForStage,
} from "../utils/analysisStages";

vi.mock("../services/analysisService");

const file = new File(["resume-bytes"], "resume.pdf", {
  type: "application/pdf",
});
const jd = "x".repeat(50);

// With Math.random() mocked to 0.5, randomInterval() === 4000ms exactly.
const TICK_MS = 4000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  analysisService.analyzeResume.mockReset();
  // The daily limit lives in localStorage: isolate every test.
  localStorage.clear();
});

afterEach(() => {
  Math.random.mockRestore();
  vi.useRealTimers();
});

describe("useResumeAnalysis message rotation", () => {
  it("A. fast response: stage stays at 0 (no tick before resolve)", async () => {
    analysisService.analyzeResume.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useResumeAnalysis());

    await act(async () => {
      await result.current.analyze(file, jd);
    });

    expect(result.current.status).toBe("success");
    expect(result.current.stage).toBe(0);
  });

  it("B. normal response: stage advances one step at a time (no regression)", async () => {
    analysisService.analyzeResume.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useResumeAnalysis());

    act(() => {
      result.current.analyze(file, jd);
    });
    expect(result.current.status).toBe("loading");
    expect(result.current.stage).toBe(0);

    let prev = 0;
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        vi.advanceTimersByTime(TICK_MS);
      });
      const s = result.current.stage;
      expect(s).toBe(prev + 1); // monotonic, +1 each tick
      prev = s;
    }
  });

  it("C. slow response: advances through all main messages without skipping", async () => {
    analysisService.analyzeResume.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useResumeAnalysis());

    await act(async () => {
      result.current.analyze(file, jd);
    });

    // Advance through every main message + one neutral.
    for (let i = 0; i < ANALYSIS_MESSAGES.length + 1; i++) {
      await act(async () => {
        vi.advanceTimersByTime(TICK_MS);
      });
    }
    expect(result.current.stage).toBe(ANALYSIS_MESSAGES.length + 1);
    expect(result.current.status).toBe("loading");
  });

  it("D. very slow response: wraps into neutral, never restarts to first msg", async () => {
    analysisService.analyzeResume.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useResumeAnalysis());

    await act(async () => {
      result.current.analyze(file, jd);
    });

    // Advance well past a full main + neutral cycle.
    for (
      let i = 0;
      i < ANALYSIS_MESSAGES.length + NEUTRAL_MESSAGES.length * 2;
      i++
    ) {
      await act(async () => {
        vi.advanceTimersByTime(TICK_MS);
      });
    }

    // Stage index only ever increased.
    expect(result.current.stage).toBeGreaterThan(
      ANALYSIS_MESSAGES.length + NEUTRAL_MESSAGES.length,
    );
    // Current message is a neutral message, never the first main one.
    const currentMessage = messageForStage(result.current.stage);
    expect(NEUTRAL_MESSAGES).toContain(currentMessage);
    expect(currentMessage).not.toBe(ANALYSIS_MESSAGES[0]);
  });

  it("E. stops the timer immediately on error (animation halts)", async () => {
    analysisService.analyzeResume.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useResumeAnalysis());

    await act(async () => {
      await expect(result.current.analyze(file, jd)).rejects.toThrow("boom");
    });
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBeTruthy();

    const frozen = result.current.stage;
    await act(async () => {
      vi.advanceTimersByTime(TICK_MS * 20);
    });
    expect(result.current.stage).toBe(frozen);
  });

  it("E2. stops the timer on success (stage frozen, no further rotation)", async () => {
    let resolveFn;
    analysisService.analyzeResume.mockImplementation(
      () =>
        new Promise((res) => {
          resolveFn = res;
        }),
    );
    const { result } = renderHook(() => useResumeAnalysis());

    await act(async () => {
      result.current.analyze(file, jd);
    });
    await act(async () => {
      vi.advanceTimersByTime(TICK_MS * 2);
    });

    expect(result.current.status).toBe("loading");
    expect(result.current.stage).toBe(2);

    await act(async () => {
      resolveFn({ ok: true });
      await Promise.resolve();
    });
    expect(result.current.status).toBe("success");

    const frozen = result.current.stage;
    await act(async () => {
      vi.advanceTimersByTime(TICK_MS * 30);
    });
    expect(result.current.stage).toBe(frozen);
  });
});

describe("useResumeAnalysis client-side daily limit", () => {
  it("F. guest: success blocks the 2nd attempt (no request sent)", async () => {
    analysisService.analyzeResume.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useResumeAnalysis(null));
    await act(async () => {
      await result.current.analyze(file, jd);
    });
    expect(result.current.status).toBe("success");
    expect(result.current.limitReached).toBe(true);
    expect(localStorage.getItem(GUEST_ANALYSIS_USED_KEY)).toBeTruthy();

    const calls = analysisService.analyzeResume.mock.calls.length;
    await act(async () => {
      await expect(result.current.analyze(file, jd)).rejects.toThrow(
        ANALYSIS_LIMIT_MESSAGE,
      );
    });
    expect(result.current.status).toBe("error");
    expect(result.current.error?.code).toBe(ANALYSIS_LIMIT_CODE);
    expect(analysisService.analyzeResume.mock.calls.length).toBe(calls);
  });

  it("G. auth: success blocks the 2nd attempt and writes only the account key", async () => {
    analysisService.analyzeResume.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useResumeAnalysis("acct-1"));
    await act(async () => {
      await result.current.analyze(file, jd);
    });
    expect(result.current.status).toBe("success");
    expect(localStorage.getItem("resumerizz_analysis_used_acct-1")).toBeTruthy();
    expect(localStorage.getItem(GUEST_ANALYSIS_USED_KEY)).toBeNull();

    await act(async () => {
      await expect(result.current.analyze(file, jd)).rejects.toThrow(
        ANALYSIS_LIMIT_MESSAGE,
      );
    });
    expect(result.current.error?.code).toBe(ANALYSIS_LIMIT_CODE);
  });

  it("H. a failed analysis does not consume the limit", async () => {
    analysisService.analyzeResume.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useResumeAnalysis("acct-2"));
    await act(async () => {
      await expect(result.current.analyze(file, jd)).rejects.toThrow("boom");
    });
    expect(result.current.status).toBe("error");
    expect(localStorage.getItem("resumerizz_analysis_used_acct-2")).toBeNull();

    analysisService.analyzeResume.mockResolvedValueOnce({ ok: true });
    await act(async () => {
      await result.current.analyze(file, jd);
    });
    expect(result.current.status).toBe("success");
  });

  it("I. a previous-day entry resets and allows the analysis", async () => {
    localStorage.setItem(
      GUEST_ANALYSIS_USED_KEY,
      JSON.stringify({ used: true, date: "2000-01-01" }),
    );
    analysisService.analyzeResume.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useResumeAnalysis(null));
    expect(result.current.limitReached).toBe(false);
    await act(async () => {
      await result.current.analyze(file, jd);
    });
    expect(result.current.status).toBe("success");
  });

  it("J. guest and authenticated keys stay separate", async () => {
    analysisService.analyzeResume.mockResolvedValue({ ok: true });
    const guest = renderHook(() => useResumeAnalysis(null));
    await act(async () => {
      await guest.result.current.analyze(file, jd);
    });
    expect(guest.result.current.limitReached).toBe(true);

    const account = renderHook(() => useResumeAnalysis("acct-9"));
    expect(account.result.current.limitReached).toBe(false);
    await act(async () => {
      await account.result.current.analyze(file, jd);
    });
    expect(account.result.current.status).toBe("success");
  });

  it("K. logout/login never resets an account daily flag", async () => {
    analysisService.analyzeResume.mockResolvedValue({ ok: true });
    const loggedIn = renderHook(() => useResumeAnalysis("acct-42"));
    await act(async () => {
      await loggedIn.result.current.analyze(file, jd);
    });
    expect(loggedIn.result.current.limitReached).toBe(true);
    loggedIn.unmount();

    const asGuest = renderHook(() => useResumeAnalysis(null));
    expect(asGuest.result.current.limitReached).toBe(false);
    await act(async () => {
      await asGuest.result.current.analyze(file, jd);
    });
    expect(asGuest.result.current.status).toBe("success");
    asGuest.unmount();

    const backIn = renderHook(() => useResumeAnalysis("acct-42"));
    expect(backIn.result.current.limitReached).toBe(true);
    await act(async () => {
      await expect(backIn.result.current.analyze(file, jd)).rejects.toThrow(
        ANALYSIS_LIMIT_MESSAGE,
      );
    });
    expect(backIn.result.current.error?.code).toBe(ANALYSIS_LIMIT_CODE);
  });
});
