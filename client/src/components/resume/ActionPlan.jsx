/**
 * The prioritized action plan and final "next steps" for the report. Actions are
 * shown in priority order (1 = highest impact).
 */
export default function ActionPlan({ plan = [] }) {
  if (plan.length === 0) return null;

  return (
    <section className="rounded-xl border-2 border-primary/40 bg-primary-soft/50 p-6">
      <h2 className="text-lg font-semibold text-text-primary">Your next steps</h2>
      <p className="mt-1 text-sm text-text-muted">
        Prioritized changes with the greatest impact on your match, starting
        with #1.
      </p>

      <ol className="mt-5 space-y-4">
        {plan.map((item, index) => (
          <li key={index} className="flex items-start gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
              {item.priority || index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text-primary">
                {item.action}
              </p>
              {item.reason && (
                <p className="mt-1 text-sm leading-relaxed text-text-muted">
                  {item.reason}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
