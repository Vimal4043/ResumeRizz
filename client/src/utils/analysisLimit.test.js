import { beforeEach, describe, expect, it } from "vitest";
import {
  ANALYSIS_LIMIT_CODE,
  ANALYSIS_LIMIT_MESSAGE,
  GUEST_ANALYSIS_USED_KEY,
  analysisLimitError,
  analysisUsedKey,
  hasUsedToday,
  markAnalysisUsed,
  todayUtcDate,
} from "./analysisLimit";

beforeEach(() => {
  localStorage.clear();
});

describe("analysisLimit: keys (guest vs authenticated)", () => {
  it("uses the guest key when there is no account", () => {
    expect(analysisUsedKey(null)).toBe(GUEST_ANALYSIS_USED_KEY);
    expect(analysisUsedKey(undefined)).toBe(GUEST_ANALYSIS_USED_KEY);
    expect(GUEST_ANALYSIS_USED_KEY).toBe("resumerizz_guest_analysis_used");
  });

  it("uses a per-account key when signed in", () => {
    expect(analysisUsedKey("user123")).toBe(
      "resumerizz_analysis_used_user123",
    );
  });

  it("keeps guest and account flags fully independent", () => {
    const now = new Date("2026-09-19T10:00:00Z");
    markAnalysisUsed(null, now);
    expect(hasUsedToday(null, now)).toBe(true);
    expect(hasUsedToday("user123", now)).toBe(false);

    markAnalysisUsed("user123", now);
    expect(hasUsedToday("user123", now)).toBe(true);
    expect(localStorage.getItem(GUEST_ANALYSIS_USED_KEY)).toBeTruthy();
    expect(localStorage.getItem("resumerizz_analysis_used_user123")).toBeTruthy();
  });
});

describe("analysisLimit: date-based reset (no 24h timer)", () => {
  it("is unused before any successful analysis", () => {
    expect(hasUsedToday(null)).toBe(false);
    expect(hasUsedToday("user123")).toBe(false);
  });

  it("stores { used: true, date } after a success", () => {
    const now = new Date("2026-09-19T10:00:00Z");
    markAnalysisUsed("user123", now);
    expect(
      JSON.parse(localStorage.getItem("resumerizz_analysis_used_user123")),
    ).toEqual({ used: true, date: "2026-09-19" });
    expect(hasUsedToday("user123", now)).toBe(true);
  });

  it("still blocks later the SAME UTC day", () => {
    localStorage.setItem(
      "resumerizz_analysis_used_u1",
      JSON.stringify({ used: true, date: "2026-09-19" }),
    );
    expect(hasUsedToday("u1", new Date("2026-09-19T23:59:59Z"))).toBe(true);
  });

  it("resets automatically once the UTC day changes, and removes the key", () => {
    localStorage.setItem(
      GUEST_ANALYSIS_USED_KEY,
      JSON.stringify({ used: true, date: "2026-09-18" }),
    );
    const now = new Date("2026-09-19T00:00:01Z");
    expect(hasUsedToday(null, now)).toBe(false);
    expect(localStorage.getItem(GUEST_ANALYSIS_USED_KEY)).toBeNull();
  });

  it("treats corrupted entries as unused", () => {
    localStorage.setItem(GUEST_ANALYSIS_USED_KEY, "not-json");
    expect(hasUsedToday(null)).toBe(false);
  });

  it("computes YYYY-MM-DD in UTC", () => {
    expect(todayUtcDate(new Date("2026-01-05T23:30:00Z"))).toBe("2026-01-05");
    expect(todayUtcDate(new Date("2026-01-06T00:30:00Z"))).toBe("2026-01-06");
  });
});

describe("analysisLimit: blocked-attempt error", () => {
  it("exposes the exact message + code", () => {
    const err = analysisLimitError();
    expect(err.code).toBe(ANALYSIS_LIMIT_CODE);
    expect(err.code).toBe("ANALYSIS_LIMIT_REACHED");
    expect(err.message).toBe(ANALYSIS_LIMIT_MESSAGE);
    expect(ANALYSIS_LIMIT_MESSAGE).toBe(
      "Today's analysis limit has been reached. Please try again tomorrow.",
    );
    expect(err.retryAfterSeconds).toBe(0);
  });
});
