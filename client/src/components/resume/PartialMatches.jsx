const STATUS = {
  supported: { label: "Strong match", badge: "bg-green-100 text-green-700" },
  partially_supported: {
    label: "Partial match",
    badge: "bg-amber-100 text-amber-700",
  },
  not_supported: { label: "Missing", badge: "bg-red-100 text-red-700" },
};

/**
 * Requirements where the resume provides some but not conclusive evidence. Makes
 * the distinction between strong / partial / missing match explicit.
 */
export default function PartialMatches({ partialMatches = [] }) {
  if (partialMatches.length === 0) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-slate-900">Match Depth</h2>
      <p className="mt-1 text-sm text-slate-500">
        Where the fit is only partial, and what’s needed to strengthen it.
      </p>

      <ul className="mt-5 space-y-4">
        {partialMatches.map((item, index) => {
          const status = STATUS[item.status] ?? STATUS.partially_supported;
          return (
            <li key={index} className="border-l-2 border-slate-200 pl-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-800">
                  {item.requirement}
                </h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.badge}`}
                >
                  {status.label}
                </span>
              </div>
              {item.evidence && (
                <p className="mt-2 text-sm text-slate-600">
                  <span className="font-medium text-slate-700">Evidence:</span>{" "}
                  {item.evidence}
                </p>
              )}
              {item.gap && (
                <p className="mt-1 text-sm text-slate-500">
                  <span className="font-medium text-slate-700">Gap:</span>{" "}
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
