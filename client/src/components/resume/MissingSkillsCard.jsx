const IMPORTANCE_STYLES = {
  high: {
    badge: "bg-danger-soft text-danger-text",
    dot: "bg-danger-soft0",
    label: "High",
  },
  medium: {
    badge: "bg-warning-soft text-warning-text",
    dot: "bg-warning",
    label: "Medium",
  },
  low: {
    badge: "bg-surface-elevated text-text-secondary",
    dot: "bg-text-muted",
    label: "Low",
  },
};

/**
 * Required/preferred requirements the resume does not yet demonstrate, shown with
 * an importance indicator and the reason. These are always framed as areas to
 * develop — never as things to add to the resume as if already true.
 */
export default function MissingSkillsCard({ missingSkills = [] }) {
  if (missingSkills.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold text-text-primary">Missing Skills</h2>
      <p className="mt-1 text-sm text-text-muted">
        Requirements this role needs that your resume does not yet demonstrate.
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
                  <p className="mt-1 text-sm leading-relaxed text-text-muted">
                    {item.reason}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 rounded-lg bg-bg px-3 py-2 text-xs text-text-muted">
        Don’t add these to your resume as if you already have them — focus on
        learning, building, and gaining the experience first.
      </p>
    </section>
  );
}
