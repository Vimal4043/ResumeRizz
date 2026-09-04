import { useState } from "react";

const VISIBLE_COUNT = 4;
const SOURCE_STYLES = {
  "Action plan": "bg-primary-soft text-primary",
  "Resume issue": "bg-danger-soft text-danger-text",
  "Missing skill": "bg-warning-soft text-warning-text",
};

const STOP_WORDS = new Set([
  "the", "a", "an", "in", "on", "for", "to", "of", "and", "with", "your",
  "this", "that", "at", "is", "are", "be", "it", "add", "fix", "use", "list",
]);

function normalizeText(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP_WORDS.has(w));
}

/** Token-overlap similarity — catches reworded duplicates of the same action. */
function isSimilar(a, b) {
  const wa = normalizeText(a);
  const wb = normalizeText(b);
  if (wa.length === 0 || wb.length === 0) return false;
  const setA = new Set(wa);
  const shared = wb.filter((w) => setA.has(w)).length;
  const smaller = Math.min(new Set(wa).size, new Set(wb).size);
  return shared / smaller >= 0.6;
}

function dedupeItems(items) {
  return items.filter(
    (item, i) =>
      !items.slice(0, i).some((other) => isSimilar(item.text, other.text)),
  );
}

/**
 * "What to fix first" — the highest-value items pulled from the existing
 * analysis data, in priority order: the ranked action plan first, then
 * high-priority resume issues, then high-importance missing skills. Effectively
 * identical recommendations (across and within sources) are deduplicated
 * BEFORE any counting, so the "show more" count always equals
 * total renderable items - visible renderable items.
 */
export default function TopPriorities({ result }) {
  const [expanded, setExpanded] = useState(false);
  if (!result) return null;

  const actionPlan = Array.isArray(result.actionPlan) ? result.actionPlan : [];
  const highIssues = (result.resumeIssues ?? []).filter(
    (i) => i.priority === "high",
  );
  const highGaps = (result.missingSkills ?? []).filter(
    (s) => s.importance === "high",
  );

  const rawItems = [
    ...actionPlan.slice(0, 3).map((a) => ({
      source: "Action plan",
      text: a.action,
      detail: a.reason,
    })),
    ...highIssues.map((i) => ({
      source: "Resume issue",
      text: i.issue,
      detail: i.recommendation,
    })),
    ...highGaps.map((s) => ({
      source: "Missing skill",
      text: `Build real experience with ${s.skill}`,
      detail: s.reason,
    })),
  ].filter((item) => item.text);

  const items = dedupeItems(rawItems);

  if (items.length === 0) return null;

  const visible = expanded ? items : items.slice(0, VISIBLE_COUNT);
  // Must exactly equal: total renderable items - visible renderable items.
  const remainingCount = items.length - visible.length;

  return (
    <section
      aria-label="What to fix first"
      className="rounded-xl border-2 border-primary/40 bg-primary-soft/50 p-6"
    >
      <h2 className="text-lg font-semibold text-text-primary">
        What to fix first
      </h2>
      <p className="mt-1 text-sm text-text-secondary">
        The highest-impact changes, ranked for this specific job.
      </p>

      <ol className="mt-5 space-y-4">
        {visible.map((item, index) => (
          <li key={`${item.source}-${index}`} className="flex items-start gap-4">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white"
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-text-primary">
                  {item.text}
                </p>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${SOURCE_STYLES[item.source] ?? "bg-surface-elevated text-text-secondary"}`}
                >
                  {item.source}
                </span>
              </div>
              {item.detail && (
                <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                  {item.detail}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>

      {remainingCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded={expanded}
          className="mt-4 text-sm font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg rounded"
        >
          Show {remainingCount} more priorit{remainingCount === 1 ? "y" : "ies"} ↓
        </button>
      )}
      {expanded && items.length > VISIBLE_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          aria-expanded={expanded}
          className="mt-4 text-sm font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg rounded"
        >
          Show fewer priorities ↑
        </button>
      )}
    </section>
  );
}