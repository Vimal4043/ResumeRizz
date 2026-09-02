/**
 * Strengths that are clearly supported by the resume, with the supporting
 * evidence. Empty sections are not rendered.
 */
export default function StrengthsCard({ strengths = [] }) {
  if (strengths.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold text-text-primary">Strengths</h2>
      <p className="mt-1 text-sm text-text-muted">
        What your resume already does well for this role.
      </p>
      <ul className="mt-5 space-y-5">
        {strengths.map((item, index) => (
          <li key={index} className="border-l-2 border-primary/40 pl-4">
            <h3 className="text-sm font-semibold text-text-primary">
              {item.title}
            </h3>
            {item.explanation && (
              <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                {item.explanation}
              </p>
            )}
            {Array.isArray(item.evidence) && item.evidence.length > 0 && (
              <ul className="mt-2 space-y-1">
                {item.evidence.map((evidence, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-text-muted"
                  >
                    <span
                      className="mt-2 h-1 w-1 shrink-0 rounded-full bg-text-muted"
                      aria-hidden="true"
                    />
                    <span>“{evidence}”</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
