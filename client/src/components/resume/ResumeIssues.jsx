const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
const PRIORITY_STYLES = {
  high: { badge: "bg-red-100 text-red-700", label: "High" },
  medium: { badge: "bg-amber-100 text-amber-700", label: "Medium" },
  low: { badge: "bg-slate-100 text-slate-600", label: "Low" },
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
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-slate-900">Resume Issues</h2>
      <p className="mt-1 text-sm text-slate-500">
        Things that weaken your resume for this specific role.
      </p>

      <ul className="mt-5 space-y-4">
        {sorted.map((item, index) => {
          const priority =
            PRIORITY_STYLES[item.priority] ?? PRIORITY_STYLES.low;
          return (
            <li key={index} className="border-l-2 border-slate-200 pl-4">
              <div className="flex flex-wrap items-center gap-2">
                {item.section && (
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                    {item.section}
                  </span>
                )}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${priority.badge}`}
                >
                  {priority.label} priority
                </span>
              </div>
              <p className="mt-2 text-sm font-medium text-slate-800">
                {item.issue}
              </p>
              {item.recommendation && (
                <p className="mt-1 text-sm leading-relaxed text-slate-500">
                  <span className="font-medium text-slate-700">
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
