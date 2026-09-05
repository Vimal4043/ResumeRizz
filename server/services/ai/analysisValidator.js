import { AppError } from "../../utils/errors.js";

/**
 * Validation + normalization of the Gemini-produced analysis JSON.
 *
 * We never blindly trust model output. This module:
 *  - extracts JSON from a possibly fenced / padded response,
 *  - checks it is a valid object,
 *  - requires all documented top-level fields,
 *  - validates the matchScore range and the enum values,
 *  - normalizes shapes so downstream consumers always get a predictable object,
 *  - and throws a clean 502 error on anything malformed instead of letting
 *    arbitrary model text leak through as if it were a valid analysis.
 */

const MISSING_SKILL_IMPORTANCE = new Set(["high", "medium", "low"]);
const PARTIAL_STATUS = new Set([
  "supported",
  "partially_supported",
  "not_supported",
]);
const RESUME_PRIORITY = new Set(["high", "medium", "low"]);

const REQUIRED_KEYS = [
  "matchScore",
  "matchSummary",
  "strengths",
  "missingSkills",
  "partialMatches",
  "keywordAnalysis",
  "resumeIssues",
  "bulletSuggestions",
  "actionPlan",
];

function invalid(
  message = "We received an invalid analysis response. Please try again.",
) {
  return new AppError(message, 502, "AI_INVALID_RESPONSE");
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asStringArray(value) {
  return asArray(value)
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
}

// Drop a bare response until we find something that looks like JSON.
function extractJson(raw) {
  const text = String(raw ?? "").trim();
  if (!text) throw invalid();

  // Strip a common markdown fence: ```json ... ``` or ``` ... ```.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw invalid();

  return candidate.slice(start, end + 1);
}

// Normalize one object element, returning a clean object or null if unusable.
function normalizeItem(item, shape) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const out = {};
  for (const key of Object.keys(shape)) {
    out[key] = shape[key](item[key]);
  }
  return out;
}

function normalizeStrengths(items) {
  return asArray(items)
    .map((it) =>
      normalizeItem(it, {
        title: asString,
        explanation: asString,
        evidence: asStringArray,
      }),
    )
    .filter(Boolean)
    .filter((s) => s.title);
}

function normalizeMissingSkills(items) {
  return asArray(items)
    .map((it) =>
      normalizeItem(it, {
        skill: asString,
        importance: (v) => {
          const s = typeof v === "string" ? v.toLowerCase() : "";
          return MISSING_SKILL_IMPORTANCE.has(s) ? s : "";
        },
        reason: asString,
      }),
    )
    .filter(Boolean)
    .filter((s) => s.skill && s.importance);
}

function normalizePartialMatches(items) {
  return asArray(items)
    .map((it) =>
      normalizeItem(it, {
        requirement: asString,
        status: (v) => {
          const s = typeof v === "string" ? v.toLowerCase() : "";
          return PARTIAL_STATUS.has(s) ? s : "";
        },
        evidence: asString,
        gap: asString,
      }),
    )
    .filter(Boolean)
    .filter((p) => p.requirement && p.status);
}

function normalizeKeywordAnalysis(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { matched: [], missing: [] };
  }
  return {
    matched: dedupeStrings(value.matched),
    missing: dedupeStrings(value.missing),
  };
}

// Case-insensitive dedupe for keyword-style string arrays.
function dedupeStrings(value) {
  const seen = new Set();
  return asStringArray(value).filter((s) => {
    const key = s.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeResumeIssues(items) {
  return asArray(items)
    .map((it) =>
      normalizeItem(it, {
        section: asString,
        issue: asString,
        priority: (v) => {
          const s = typeof v === "string" ? v.toLowerCase() : "";
          return RESUME_PRIORITY.has(s) ? s : "";
        },
        recommendation: asString,
      }),
    )
    .filter(Boolean)
    .filter((r) => r.issue);
}

function normalizeBulletSuggestions(items) {
  return asArray(items)
    .map((it) =>
      normalizeItem(it, {
        section: asString,
        original: asString,
        suggestion: asString,
        reason: asString,
      }),
    )
    .filter(Boolean)
    .filter((b) => b.suggestion);
}

function normalizeActionPlan(items) {
  const plan = asArray(items)
    .map((it) =>
      normalizeItem(it, {
        priority: (v) => {
          const n = Number(v);
          return Number.isInteger(n) && n >= 1 ? n : null;
        },
        action: asString,
        reason: asString,
      }),
    )
    .filter(Boolean)
    .filter((a) => a.action);

  // Honor the model's priority ranking (stable), then renumber to 1..n.
  plan.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
  return plan.map((item, index) => ({ ...item, priority: index + 1 }));
}

/**
 * Validate + normalize a Gemini response into the canonical analysis object.
 * @param {string} raw - The raw text returned by Gemini.
 * @returns {object} The validated, normalized analysis.
 */
export function validateAndNormalizeAnalysis(raw) {
  let jsonText;
  try {
    jsonText = extractJson(raw);
  } catch {
    throw invalid();
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    // Never surface parser internals — one consistent user-safe message.
    throw invalid();
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw invalid();
  }

  // All documented fields are required (arrays may be empty).
  for (const key of REQUIRED_KEYS) {
    if (!(key in parsed)) throw invalid();
  }

  const matchScore = Number(parsed.matchScore);
  if (!Number.isFinite(matchScore) || matchScore < 0 || matchScore > 100) {
    throw invalid();
  }

  return {
    matchScore: Math.round(matchScore),
    matchSummary: asString(parsed.matchSummary),
    strengths: normalizeStrengths(parsed.strengths),
    missingSkills: normalizeMissingSkills(parsed.missingSkills),
    partialMatches: normalizePartialMatches(parsed.partialMatches),
    keywordAnalysis: normalizeKeywordAnalysis(parsed.keywordAnalysis),
    resumeIssues: normalizeResumeIssues(parsed.resumeIssues),
    bulletSuggestions: normalizeBulletSuggestions(parsed.bulletSuggestions),
    actionPlan: normalizeActionPlan(parsed.actionPlan),
  };
}
