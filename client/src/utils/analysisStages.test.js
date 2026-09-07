import { describe, expect, it } from "vitest";
import {
  ANALYSIS_MESSAGES,
  NEUTRAL_MESSAGES,
  messageForStage,
  finalMainMessageIndex,
} from "./analysisStages";

describe("ANALYSIS_MESSAGES", () => {
  it("has 13 unique, non-empty messages", () => {
    expect(ANALYSIS_MESSAGES.length).toBe(13);
    expect(new Set(ANALYSIS_MESSAGES).size).toBe(ANALYSIS_MESSAGES.length);
    expect(ANALYSIS_MESSAGES.every((m) => m.trim().length > 0)).toBe(true);
  });

  it("ends each message with an ellipsis (conversational, not final)", () => {
    expect(ANALYSIS_MESSAGES.every((m) => m.endsWith("..."))).toBe(true);
  });

  it("excludes meaningless AI filler messages", () => {
    const forbidden = [
      "thinking",
      "processing",
      "magic",
      "cooking",
      "almost there",
      "working",
      "doing",
    ];
    for (const msg of ANALYSIS_MESSAGES) {
      const lower = msg.toLowerCase();
      for (const bad of forbidden) {
        expect(lower).not.toContain(bad);
      }
    }
  });

  it("describes believable analysis concepts, not generic placeholders", () => {
    for (const msg of ANALYSIS_MESSAGES) {
      expect(msg.toLowerCase()).not.toContain("analyzing your resume");
      expect(msg.length).toBeGreaterThan(15);
    }
  });
});

describe("NEUTRAL_MESSAGES", () => {
  it("has at least 2 unique, non-empty messages", () => {
    expect(NEUTRAL_MESSAGES.length).toBeGreaterThanOrEqual(2);
    expect(new Set(NEUTRAL_MESSAGES).size).toBe(NEUTRAL_MESSAGES.length);
    expect(NEUTRAL_MESSAGES.every((m) => m.trim().length > 0)).toBe(true);
  });
});

describe("messageForStage", () => {
  it("returns the first message for stage 0", () => {
    expect(messageForStage(0)).toBe(ANALYSIS_MESSAGES[0]);
  });

  it("returns the correct message for each stage in the main list", () => {
    for (let i = 0; i < ANALYSIS_MESSAGES.length; i++) {
      expect(messageForStage(i)).toBe(ANALYSIS_MESSAGES[i]);
    }
  });

  it("wraps into neutral messages after the main list is exhausted", () => {
    const lastMain = ANALYSIS_MESSAGES.length - 1;
    expect(messageForStage(lastMain)).toBe(ANALYSIS_MESSAGES[lastMain]);
    expect(messageForStage(lastMain + 1)).toBe(NEUTRAL_MESSAGES[0]);
    expect(messageForStage(lastMain + 2)).toBe(NEUTRAL_MESSAGES[1]);
    expect(messageForStage(lastMain + 3)).toBe(NEUTRAL_MESSAGES[2]);
    // wraps around
    expect(messageForStage(lastMain + 4)).toBe(NEUTRAL_MESSAGES[0]);
  });

  it("never returns the first main message again after the main list is exhausted", () => {
    for (let s = ANALYSIS_MESSAGES.length; s < ANALYSIS_MESSAGES.length + 100; s++) {
      expect(messageForStage(s)).not.toBe(ANALYSIS_MESSAGES[0]);
    }
  });

  it("handles negative stage defensively (returns first message)", () => {
    expect(messageForStage(-1)).toBe(ANALYSIS_MESSAGES[0]);
    expect(messageForStage(-999)).toBe(ANALYSIS_MESSAGES[0]);
  });
});

describe("finalMainMessageIndex", () => {
  it("returns the index of the last main message", () => {
    expect(finalMainMessageIndex()).toBe(ANALYSIS_MESSAGES.length - 1);
  });
});
