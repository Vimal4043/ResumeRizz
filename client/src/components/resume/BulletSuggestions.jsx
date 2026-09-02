import { useState } from "react";

/**
 * Factual bullet-point rewrites. The original is always shown alongside the
 * suggestion so it is never silently replaced. A copy button copies the suggested
 * version for later use.
 */
export default function BulletSuggestions({ suggestions = [] }) {
  const [copiedIndex, setCopiedIndex] = useState(null);

  if (suggestions.length === 0) return null;

  async function copy(text, index) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 1800);
    } catch {
      // Clipboard can be blocked; fall back silently rather than breaking the UI.
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-slate-900">
        Bullet-point Suggestions
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Stronger, fact-accurate rewrites of your existing bullet points. Your
        original is kept intact for comparison.
      </p>

      <ul className="mt-5 space-y-4">
        {suggestions.map((item, index) => (
          <li key={index} className="rounded-lg border border-slate-200 p-4">
            {item.section && (
              <span className="mb-2 inline-block rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                {item.section}
              </span>
            )}
            <div className="mt-2 grid gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Original
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {item.original || "—"}
                </p>
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                    Suggested
                  </p>
                  {item.suggestion && (
                    <button
                      type="button"
                      onClick={() => copy(item.suggestion, index)}
                      className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-700"
                    >
                      {copiedIndex === index ? "Copied ✓" : "Copy"}
                    </button>
                  )}
                </div>
                {item.suggestion ? (
                  <p className="mt-1 text-sm font-medium text-slate-800">
                    {item.suggestion}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-slate-400">
                    No suggestion available.
                  </p>
                )}
              </div>
            </div>
            {item.reason && (
              <p className="mt-3 border-t border-slate-100 pt-2 text-sm text-slate-500">
                <span className="font-medium text-slate-600">Why:</span>{" "}
                {item.reason}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
