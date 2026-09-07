import Spinner from "../common/Spinner.jsx";
import { messageForStage } from "../../utils/analysisStages.js";

export default function AnalysisProgress({ stage = 0 }) {
  const message = messageForStage(stage);

  return (
    <div className="rounded-xl border border-border bg-surface p-6 sm:p-12">
      <div className="mx-auto flex max-w-md flex-col items-center gap-6 text-center">
        <Spinner size="lg" />

        <p
          key={stage}
          aria-live="polite"
          aria-atomic="true"
          className="rr-fade-in text-sm font-medium text-text-primary"
        >
          {message}
        </p>

        {/* Supporting context — deliberately makes no timing promise. */}
        <p className="text-xs text-text-muted">
          We're comparing your resume with the role and preparing personalized
          recommendations.
        </p>
      </div>
    </div>
  );
}
