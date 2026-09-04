const IMPORTANCE_STYLES = {
  high: {
    badge: "bg-danger-soft text-danger-text",
    dot: "bg-danger",
    label: "Required missing",
  },
  medium: {
    badge: "bg-warning-soft text-warning-text",
    dot: "bg-warning",
    label: "Preferred missing",
  },
  low: {
    badge: "bg-warning-soft text-warning-text",
    dot: "bg-warning",
    label: "Preferred missing",
  },
};

/**
 * Requirements the resume does not yet demonstrate, grouped by importance:
 * "high" maps to REQUIRED missing (critical for the role) and "medium"/"low"
 * to PREFERRED missing (nice-to-haves), each with the reason. Always framed
 * as areas to develop — never as things to add to the resume as if already
 * true.
 */
export default function MissingSkillsCard({ missingSkills = [] }) {
  if (missingSkills.length === 0) {
    // Concise positive state — only shown when the data supports it.
    return (
      <section
        aria-label="Missing skills"
        className="rounded-xl border border-success/40 bg-success-soft px-4 py-3"
      >
        <p className="text-sm font-medium text-success-text">
          ✓ No major skill gaps identified for this role.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="Missing skills"
      className="rounded-xl border border-border bg-surface p-6"
    >
      <h2 className="text-lg font-semibold text-text-primary">Missing Skills</h2>
      <p className="mt-1 text-sm text-text-secondary">
        Requirements this role needs that your resume does not yet demonstrate —
        areas to learn and build, not lines to add.
      </p>

      <ul className="mt-5 divide-y divide-border">
        {missingSkills.map((item, index) => {
          const importance =
            IMPORTANCE_STYLES[item.importance] ?? IMPORTANCE_STYLES.low;
          return (
            <li key={index} className="flex items-start gap-3 py-3">
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${importance.dot}`}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-text-primary">
                    {item.skill}
                  </h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${importance.badge}`}
                  >
                    {importance.label}
                  </span>
                </div>
                {item.reason && (
                  <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                    {item.reason}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 rounded-lg bg-bg px-3 py-2 text-xs text-text-secondary">
        Don’t add these to your resume as if you already have them — focus on
        learning, building, and gaining the experience first.
      </p>
    </section>
  );
}
