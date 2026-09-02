/**
 * Keyword-level view of matched vs missing terminology. Matched and missing are
 * clearly differentiated. No encouragement toward keyword stuffing — the focus
 * stays on genuinely learning/using the technology.
 */
export default function KeywordAnalysis({ analysis = {} }) {
  const matched = Array.isArray(analysis.matched) ? analysis.matched : [];
  const missing = Array.isArray(analysis.missing) ? analysis.missing : [];

  if (matched.length === 0 && missing.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold text-text-primary">Keyword Analysis</h2>
      <p className="mt-1 text-sm text-text-muted">
        Important job terminology and whether it appears in your resume.
      </p>

      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-success-text">Matched</h3>
          {matched.length === 0 ? (
            <p className="mt-2 text-sm text-text-muted">No matching keywords.</p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2">
              {matched.map((keyword, index) => (
                <li
                  key={index}
                  className="rounded-md bg-success-soft px-2.5 py-1 text-xs font-medium text-success-text"
                >
                  {keyword}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-danger-text">Missing</h3>
          {missing.length === 0 ? (
            <p className="mt-2 text-sm text-text-muted">No missing keywords.</p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2">
              {missing.map((keyword, index) => (
                <li
                  key={index}
                  className="rounded-md bg-danger-soft px-2.5 py-1 text-xs font-medium text-danger-text"
                >
                  {keyword}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="mt-4 rounded-lg bg-bg px-3 py-2 text-xs text-text-muted">
        Rather than padding your resume with missing keywords, build or apply
        the skill so the claim is real and defensible.
      </p>
    </section>
  );
}
