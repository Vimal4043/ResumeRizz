import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AnalysisProgress from "./AnalysisProgress";
import {
  ANALYSIS_MESSAGES,
  NEUTRAL_MESSAGES,
  messageForStage,
} from "../../utils/analysisStages";

describe("AnalysisProgress", () => {
  it("renders no list/checklist (only one message visible)", () => {
    render(<AnalysisProgress stage={3} />);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("displays the single message for the current stage", () => {
    render(<AnalysisProgress stage={5} />);
    expect(screen.getByText(messageForStage(5))).toBeInTheDocument();
  });

  it("never reveals a step count, percentage, or progress bar", () => {
    render(<AnalysisProgress stage={2} />);
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    expect(screen.queryByText(/step \d+ of/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("announces the active message in a polite live region", () => {
    render(<AnalysisProgress stage={4} />);
    const live = document.querySelector("[aria-live='polite']");
    expect(live).toHaveTextContent(messageForStage(4));
  });

  it("renders the neutral message when stage is past the main list", () => {
    const stage = ANALYSIS_MESSAGES.length + 1;
    render(<AnalysisProgress stage={stage} />);
    expect(screen.getByText(NEUTRAL_MESSAGES[1])).toBeInTheDocument();
  });

  it("renders the spinner alongside the message", () => {
    render(<AnalysisProgress stage={0} />);
    expect(
      screen.getByRole("status", { name: /loading/i }),
    ).toBeInTheDocument();
  });

  it("includes the neutral supporting text (no timing promise)", () => {
    render(<AnalysisProgress stage={0} />);
    expect(
      screen.getByText(/comparing your resume with the role/i),
    ).toBeInTheDocument();
    // Must not promise a specific completion time.
    expect(screen.queryByText(/up to a minute/i)).not.toBeInTheDocument();
  });

  it("clamps a very large stage to a neutral message (no restart to first msg)", () => {
    render(<AnalysisProgress stage={999} />);
    // 999 is well into the neutral pool — must never be the first main message.
    const displayed = screen.getByText(messageForStage(999));
    expect(displayed.textContent).not.toBe(ANALYSIS_MESSAGES[0]);
    expect(NEUTRAL_MESSAGES).toContain(displayed.textContent);
  });
});