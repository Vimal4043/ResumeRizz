import { useEffect, useRef } from "react";
import Spinner from "../common/Spinner.jsx";
import { useReducedMotion } from "../../hooks/useReducedMotion.js";
import { ANALYSIS_STAGES } from "../../utils/analysisStages.js";

/**
 * Progress UI shown while an analysis request is in flight.
 *
 * Stages advance strictly ONE WAY (never looping, never repeating a completed
 * stage) at stage-specific durations based on elapsed wall-clock time. The
 * frontend cannot observe Gemini's internal progress, so these are UX-oriented
 * phases that describe the overall process — not a claim that a specific
 * backend operation is happening right now, and never a fake percentage.
 *
 * The final stage holds until the API resolves. On success/error the hook
 * stops the timer and this component unmounts (replaced by the results page or
 * the existing error UI) — the animation never lingers on a failed request.
 *
 * @param {{ stage?: number }} props
 */
export default function AnalysisProgress({ stage = 0 }) {
  const prefersReduced = useReducedMotion();
  const activeItemRef = useRef(null);

  // Clamp the active stage to a valid index (defensive: the hook never
  // over-shoots, but this keeps render-time reads safe).
  const activeStage = Math.max(
    0,
    Math.min(stage, ANALYSIS_STAGES.length - 1),
  );

  // Keep the current stage visible within the fixed-height, scrollable list.
  // Uses "nearest" + smooth scrolling (instant if reduced motion) so the
  // page never jumps — only the list scrolls internally.
  useEffect(() => {
    const node = activeItemRef.current;
    if (!node) return;
    node.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: prefersReduced ? "auto" : "smooth",
    });
  }, [stage, prefersReduced]);

  return (
    <div className="rounded-xl border border-border bg-surface p-8 sm:p-12">
      <div className="mx-auto flex max-w-md flex-col items-center gap-6 text-center">
        <Spinner size="lg" />

        {/* Active stage name — announced to screen readers on each change.
            Polite + atomic so it's one concise announcement per step (no spam). */}
        <p
          aria-live="polite"
          aria-atomic="true"
          className="text-sm font-medium text-text-primary"
        >
          {ANALYSIS_STAGES[activeStage]?.label ?? "Analyzing your resume"}
        </p>

        {/* Supporting context — deliberately makes no timing promise. */}
        <p className="text-xs text-text-muted">
          We're comparing your resume with the role and preparing personalized
          recommendations.
        </p>

        {/* Fixed-height, internally scrollable stage list. */}
        <ol
          className="w-full space-y-3"
          style={{ maxHeight: "280px", overflowY: "auto" }}
          role="list"
        >
          {ANALYSIS_STAGES.map((step, index) => {
            const isComplete = index < activeStage;
            const isActive = index === activeStage;
            const labelClass = isActive
              ? "font-medium text-text-primary"
              : isComplete
                ? "text-text-secondary"
                : "text-text-muted";

            return (
              <li
                key={step.label}
                ref={isActive ? activeItemRef : undefined}
                aria-current={isActive ? "step" : undefined}
              >
                <div className="flex items-center gap-3">
                  <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
                    {isComplete ? (
                      <CheckMark
                        animate={!prefersReduced}
                        className="h-4 w-4 text-success"
                      />
                    ) : isActive ? (
                      <>
                        <span
                          className="block h-2.5 w-2.5 rounded-full bg-primary"
                          aria-hidden="true"
                        />
                        {!prefersReduced && (
                          <span
                            className="absolute inset-0 rounded-full bg-primary/25 rr-pulse-dot"
                            aria-hidden="true"
                          />
                        )}
                      </>
                    ) : (
                      <span
                        className="block h-2.5 w-2.5 rounded-full bg-current opacity-30"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  <span
                    className={`text-sm ${labelClass} ${
                      prefersReduced ? "" : "transition-colors duration-150"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

/**
 * A small checkmark for completed stages. Fades/scales in when motion is
 * allowed; rendered statically otherwise (no animation in reduced motion).
 */
function CheckMark({ animate, className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={animate ? `${className} rr-check-appear` : className}
      aria-hidden="true"
    >
      <path
        className="stroke-current"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 13l4 4 10-10"
      />
    </svg>
  );
}
