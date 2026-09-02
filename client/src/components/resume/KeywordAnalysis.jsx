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
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-slate-900">Keyword Analysis</h2>
      <p className="mt-1 text-sm text-slate-500">
        Important job terminology and whether it appears in your resume.
      </p>

      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-green-700">Matched</h3>
          {matched.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">No matching keywords.</p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2">
              {matched.map((keyword, index) => (
                <li
                  key={index}
                  className="rounded-md bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700"
                >
                  {keyword}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-red-700">Missing</h3>
          {missing.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">No missing keywords.</p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2">
              {missing.map((keyword, index) => (
                <li
                  key={index}
                  className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700"
                >
                  {keyword}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
        Rather than padding your resume with missing keywords, build or apply
        the skill so the claim is real and defensible.
      </p>
    </section>
  );
}
