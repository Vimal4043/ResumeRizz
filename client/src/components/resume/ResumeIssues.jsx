const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
const PRIORITY_STYLES = {
  high: { badge: "bg-danger-soft text-danger-text", label: "High" },
  medium: { badge: "bg-warning-soft text-warning-text", label: "Medium" },
  low: { badge: "bg-surface-elevated text-text-secondary", label: "Low" },
};

/**
 * Issues that reduce the resume's effectiveness for this job, sorted by priority
 * (high first), each with a recommendation.
 */
export default function ResumeIssues({ issues = [] }) {
  if (issues.length === 0) return null;

  const sorted = [...issues].sort(
    (a, b) =>
      (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99),
  );

  return (
    <section className="rounded-xl border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold text-text-primary">Resume Issues</h2>
      <p className="mt-1 text-sm text-text-muted">
        Things that weaken your resume for this specific role.
      </p>

      <ul className="mt-5 space-y-4">
        {sorted.map((item, index) => {
          const priority =
            PRIORITY_STYLES[item.priority] ?? PRIORITY_STYLES.low;
          return (
            <li key={index} className="border-l-2 border-border pl-4">
              <div className="flex flex-wrap items-center gap-2">
                {item.section && (
                  <span className="rounded bg-surface-elevated px-2 py-0.5 text-xs font-medium text-text-muted">
                    {item.section}
                  </span>
                )}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${priority.badge}`}
                >
                  {priority.label} priority
                </span>
              </div>
              <p className="mt-2 text-sm font-medium text-text-primary">
                {item.issue}
              </p>
              {item.recommendation && (
                <p className="mt-1 text-sm leading-relaxed text-text-muted">
                  <span className="font-medium text-text-secondary">
                    Recommendation:
                  </span>{" "}
                  {item.recommendation}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
