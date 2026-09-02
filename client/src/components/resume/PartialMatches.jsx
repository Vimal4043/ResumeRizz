const STATUS = {
  supported: { label: "Strong match", badge: "bg-success-soft text-success-text" },
  partially_supported: {
    label: "Partial match",
    badge: "bg-warning-soft text-warning-text",
  },
  not_supported: { label: "Missing", badge: "bg-danger-soft text-danger-text" },
};

/**
 * Requirements where the resume provides some but not conclusive evidence. Makes
 * the distinction between strong / partial / missing match explicit.
 */
export default function PartialMatches({ partialMatches = [] }) {
  if (partialMatches.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold text-text-primary">Match Depth</h2>
      <p className="mt-1 text-sm text-text-muted">
        Where the fit is only partial, and what’s needed to strengthen it.
      </p>

      <ul className="mt-5 space-y-4">
        {partialMatches.map((item, index) => {
          const status = STATUS[item.status] ?? STATUS.partially_supported;
          return (
            <li key={index} className="border-l-2 border-border pl-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-text-primary">
                  {item.requirement}
                </h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.badge}`}
                >
                  {status.label}
                </span>
              </div>
              {item.evidence && (
                <p className="mt-2 text-sm text-text-secondary">
                  <span className="font-medium text-text-secondary">Evidence:</span>{" "}
                  {item.evidence}
                </p>
              )}
              {item.gap && (
                <p className="mt-1 text-sm text-text-muted">
                  <span className="font-medium text-text-secondary">Gap:</span>{" "}
                  {item.gap}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
