function scoreColor(score) {
  if (score >= 80) return { text: "text-success-text", bar: "bg-success" };
  if (score >= 60) return { text: "text-warning-text", bar: "bg-warning" };
  return { text: "text-danger-text", bar: "bg-danger-soft0" };
}

/**
 * Job Match Score (0–100) with a readable summary. The score is an honest,
 * evidence-based estimate of fit — it does not guarantee interview selection.
 */
export default function MatchScore({ score = 0, summary = "" }) {
  const clamped = Math.min(Math.max(Number(score) || 0, 0), 100);
  const { text, bar } = scoreColor(clamped);

  return (
    <section className="rounded-xl border border-border bg-surface p-6">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="flex shrink-0 flex-col items-center sm:items-start">
          <div className="flex items-baseline gap-2">
            <span className={`text-5xl font-extrabold tracking-tight ${text}`}>
              {clamped}
            </span>
            <span className="text-xl font-semibold text-text-muted">/ 100</span>
          </div>
          <p className="mt-1 text-sm font-medium text-text-secondary">
            Job Match Score
          </p>
          <div className="mt-3 h-2 w-40 overflow-hidden rounded-full bg-border">
            <div
              className={`h-full rounded-full ${bar} transition-all`}
              style={{ width: `${clamped}%` }}
              role="progressbar"
              aria-valuenow={clamped}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Job Match Score ${clamped} out of 100`}
            />
          </div>
        </div>
        {summary && (
          <p className="text-sm leading-relaxed text-text-secondary sm:border-l sm:border-border sm:pl-6">
            {summary}
          </p>
        )}
      </div>
      <p className="mt-4 text-xs text-text-muted">
        This is an estimate of how well your current resume matches this job,
        not a guarantee of interview selection.
      </p>
    </section>
  );
}
