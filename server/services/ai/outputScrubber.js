import { extractResumeNumbers } from "./evidenceAnalyzer.js";

/**
 * Deterministic, post-AI output scrubbing.
 *
 * The validator guarantees the SHAPE of the analysis; this module guarantees
 * some FACTS, using the resume itself as ground truth:
 *  1. Fabricated numbers — any bullet suggestion / strength explanation that
 *     introduces a metric (%, money, users, "3x", ...) absent from the resume
 *     is rewritten to a neutral form or dropped.
 *  2. Keyword lists — "missing" keywords that actually appear in the resume,
 *     and "matched" keywords that don't, are corrected so the UI never
 *     encourages keyword stuffing.
 */

const NUM_IN_TEXT_RE =
  /\b\d+(?:\.\d+)?\s*(?:%|percent|x|k|m|bn|billion|million|thousand|hours?|users|customers|clients|ms|days?|weeks?|months?)?/gi;

function numbersIn(text) {
  const found = new Set();
  let m;
  NUM_IN_TEXT_RE.lastIndex = 0;
  const t = String(text ?? "");
  while ((m = NUM_IN_TEXT_RE.exec(t)) !== null) {
    const token = m[0].trim().toLowerCase().replace(/\s+/g, " ");
    if (!token || /^\d{4}$/.test(token)) continue;
    found.add(token);
  }
  return found;
}

/** True when `text` introduces at least one number that the resume lacks. */
function hasFabricatedNumbers(text, resumeNumbers) {
  for (const n of numbersIn(text)) {
    // Accept also the bare digit (resume may write "40" without "%").
    const bare = n.replace(/\s*(?:%|percent)$/, "").trim();
    if (!resumeNumbers.has(n) && !resumeNumbers.has(bare)) return true;
  }
  return false;
}

/** Remove the unsupported numeric claims, keep the truthful remainder. */
function stripNumbers(text) {
  return String(text ?? "")
    // "%" is a non-word char, so no trailing \b after it.
    .replace(/\b\d+(?:\.\d+)?\s*(?:%|percent\b)/gi, "meaningful improvement")
    .replace(/\b\d+(?:\.\d+)?\s*(?:x|k|m)\b/gi, "")
    .replace(
      /\b\d+(?:\.\d+)?\s*(?:hours?|users|customers|clients|days?|weeks?|months?)\b/gi,
      "",
    )
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;])/g, "$1")
    .trim();
}

/**
 * Scrub the validated analysis against the resume ground truth.
 * @param {object} analysis - validated analysis object (mutated copy returned).
 * @param {string} resumeRawText
 * @returns {object} the scrubbed analysis.
 */
export function scrubAnalysis(analysis, resumeRawText) {
  const resumeNumbers = extractResumeNumbers(resumeRawText);
  const out = { ...analysis };

  out.bulletSuggestions = (analysis.bulletSuggestions ?? [])
    .map((b) => {
      if (!hasFabricatedNumbers(b.suggestion, resumeNumbers)) return b;
      const cleaned = stripNumbers(b.suggestion);
      // If nothing meaningful remains, drop the suggestion entirely.
      if (cleaned.replace(/[^a-z]/gi, "").length < 20) return null;
      return {
        ...b,
        suggestion: cleaned,
        reason: `${b.reason} (Unsupported metrics were removed — only numbers already in your resume can be used.)`,
      };
    })
    .filter(Boolean);

  out.strengths = (analysis.strengths ?? []).map((s) => {
    if (hasFabricatedNumbers(s.explanation, resumeNumbers)) {
      return { ...s, explanation: stripNumbers(s.explanation) };
    }
    return s;
  });

  // Keyword lists must agree with the actual resume text.
  const haystack = String(resumeRawText ?? "").toLowerCase();
  const appears = (kw) =>
    haystack.includes(String(kw ?? "").toLowerCase().trim());
  out.keywordAnalysis = {
    matched: (analysis.keywordAnalysis?.matched ?? []).filter(appears),
    missing: (analysis.keywordAnalysis?.missing ?? []).filter(
      (kw) => !appears(kw),
    ),
  };

  return out;
}
