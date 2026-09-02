import Spinner from "../common/Spinner.jsx";
import { ANALYSIS_STEPS } from "../../utils/constants.js";

/**
 * Progress UI shown while an analysis is running. Stages advance with the request
 * lifecycle (the hook cycles through ANALYSIS_STEPS), giving the user a clear
 * sense of ongoing work without claiming precise internal progress or faking a
 * percentage.
 */
export default function AnalysisProgress({
  message = "Analyzing your resume…",
  stage = 0,
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-8 sm:p-12">
      <div className="mx-auto flex max-w-md flex-col items-center gap-6 text-center">
        <Spinner size="lg" />
        <div aria-live="polite">
          <p className="text-sm font-medium text-text-secondary">{message}</p>
          <p className="mt-1 text-xs text-text-muted">
            This typically takes up to a minute.
          </p>
        </div>

        <ol className="w-full space-y-3 text-left">
          {ANALYSIS_STEPS.map((step, index) => {
            const active = index === stage;
            return (
              <li key={step} className="flex items-center gap-3">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    active
                      ? "bg-primary text-white"
                      : "bg-surface-elevated text-text-muted"
                  }`}
                >
                  {index + 1}
                </span>
                <span
                  className={`text-sm ${active ? "font-medium text-text-primary" : "text-text-muted"}`}
                >
                  {step}
                </span>
                {active && (
                  <span
                    className="ml-auto h-1.5 w-1.5 animate-pulse rounded-full bg-primary"
                    aria-hidden="true"
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
