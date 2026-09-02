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
    <section className="rounded-xl border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold text-text-primary">
        Bullet-point Suggestions
      </h2>
      <p className="mt-1 text-sm text-text-muted">
        Stronger, fact-accurate rewrites of your existing bullet points. Your
        original is kept intact for comparison.
      </p>

      <ul className="mt-5 space-y-4">
        {suggestions.map((item, index) => (
          <li key={index} className="rounded-lg border border-border p-4">
            {item.section && (
              <span className="mb-2 inline-block rounded bg-surface-elevated px-2 py-0.5 text-xs font-medium text-text-muted">
                {item.section}
              </span>
            )}
            <div className="mt-2 grid gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Original
                </p>
                <p className="mt-1 text-sm text-text-muted">
                  {item.original || "—"}
                </p>
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    Suggested
                  </p>
                  {item.suggestion && (
                    <button
                      type="button"
                      onClick={() => copy(item.suggestion, index)}
                      className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      {copiedIndex === index ? "Copied ✓" : "Copy"}
                    </button>
                  )}
                </div>
                {item.suggestion ? (
                  <p className="mt-1 text-sm font-medium text-text-primary">
                    {item.suggestion}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-text-muted">
                    No suggestion available.
                  </p>
                )}
              </div>
            </div>
            {item.reason && (
              <p className="mt-3 border-t border-border pt-2 text-sm text-text-muted">
                <span className="font-medium text-text-secondary">Why:</span>{" "}
                {item.reason}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
