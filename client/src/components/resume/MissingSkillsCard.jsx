const IMPORTANCE_STYLES = {
  high: {
    badge: "bg-red-100 text-red-700",
    dot: "bg-red-500",
    label: "High",
  },
  medium: {
    badge: "bg-amber-100 text-amber-700",
    dot: "bg-amber-500",
    label: "Medium",
  },
  low: {
    badge: "bg-slate-100 text-slate-600",
    dot: "bg-slate-400",
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
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-slate-900">Missing Skills</h2>
      <p className="mt-1 text-sm text-slate-500">
        Requirements this role needs that your resume does not yet demonstrate.
      </p>

      <ul className="mt-5 divide-y divide-slate-100">
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
                  <h3 className="text-sm font-semibold text-slate-800">
                    {item.skill}
                  </h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${importance.badge}`}
                  >
                    {importance.label}
                  </span>
                </div>
                {item.reason && (
                  <p className="mt-1 text-sm leading-relaxed text-slate-500">
                    {item.reason}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
        Don’t add these to your resume as if you already have them — focus on
        learning, building, and gaining the experience first.
      </p>
    </section>
  );
}
