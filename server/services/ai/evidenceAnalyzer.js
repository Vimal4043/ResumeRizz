import { logger } from "../../utils/logger.js";

/**
 * Deterministic, local (no AI) evidence analysis.
 *
 * Before the prompt is built we compute, purely with rules:
 *  - for every JD skill: how strongly the resume supports it
 *    (listed / demonstrated / indirect / absent) and where;
 *  - the JD's minimum years of experience vs the professional time spans
 *    actually present in the resume;
 *  - every distinct number that appears in the resume, so fabricated
 *    metrics in the AI response can be caught deterministically afterwards.
 *
 * This keeps the single Gemini call focused on judgment (scoring, writing)
 * instead of re-deriving facts, and gives us ground truth to validate the
 * model output against.
 */

// Phrases that signal aspirational/weak claims — a skill appearing ONLY next to
// one of these must not be treated as real experience.
const WEAK_INTENT_RE =
  /\b(?:interested in|want to (?:learn|work)|willing to learn|currently learning|learning|eager to|exploring|looking to learn|familiar with|basic knowledge|exposure to|coursework in)\b/i;

// Sections that count as "demonstrated" evidence when a skill occurs there.
const STRONG_SECTIONS = ["experience", "projects", "achievements"];

const YEAR = "(?:19|20)\\d{2}";
// Numbers we care about for the fabrication check: percentages, counts with
// units, money, "3x" style multipliers.
const NUMBER_RE =
  /\b\d+(?:\.\d+)?\s*(?:%|percent|x|k|m|bn|billion|million|thousand|hours?|users|customers|clients|ms|days?|weeks?|months?)?/gi;

function normalize(s) {
  return String(s ?? "").toLowerCase();
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Word-boundary-ish regex for a skill token (handles e.g. "c++", "node.js"). */
function skillRe(skill) {
  return new RegExp(
    `(?<![\\w+.#])${escapeRe(normalize(skill).trim())}(?![\\w+.#])`,
    "gi",
  );
}

function skillOccurrences(haystack, skill) {
  const re = skillRe(skill);
  const out = [];
  let m;
  while ((m = re.exec(haystack)) !== null) {
    out.push({
      index: m.index,
      context: haystack.slice(Math.max(0, m.index - 70), m.index + 70),
    });
    if (re.lastIndex === m.index) re.lastIndex += 1;
  }
  return out;
}

/** Collect "blocks of interest": each structured section's text plus raw text. */
function buildBlocks(resume) {
  const blocks = [];
  const push = (label, section, text) => {
    if (text && String(text).trim())
      blocks.push({ label, section, text: String(text) });
  };

  push("Skills section", "skills", (resume.skills ?? []).join("; "));
  push("Summary", "summary", resume.summary);
  for (const e of resume.experience ?? []) {
    push(
      `Experience — ${e.title || e.company || "role"}`,
      "experience",
      [e.title, e.company, ...(e.points ?? []), e.dates]
        .filter(Boolean)
        .join(". "),
    );
  }
  for (const p of resume.projects ?? []) {
    push(
      `Project — ${p.name || "unnamed project"}`,
      "projects",
      [p.name, p.description, ...(p.bullets ?? []), ...(p.technologies ?? [])]
        .filter(Boolean)
        .join(". "),
    );
  }
  for (const ed of resume.education ?? []) {
    push(
      "Education",
      "education",
      [ed.degree, ed.institution, ed.field].filter(Boolean).join(" — "),
    );
  }
  for (const c of resume.certifications ?? []) {
    push("Certifications", "certifications", c.name);
  }
  push("Resume (other)", "other", resume.rawText);
  return blocks;
}

/**
 * Classify the evidence the resume offers for one JD skill.
 * @returns {{level: 'demonstrated'|'listed'|'indirect'|'absent', where: string[], weakContext: boolean}}
 */
export function classifySkillEvidence(resume, skill) {
  const blocks = buildBlocks(resume);
  let level = "absent";
  const where = [];
  let weakContext = false;

  for (const block of blocks) {
    const occ = skillOccurrences(block.text, skill);
    if (!occ.length) continue;
    const isWeak = occ.every((o) => WEAK_INTENT_RE.test(o.context));
    if (isWeak) weakContext = true;

    if (block.section === "skills" || block.section === "certifications") {
      if (level === "absent" || level === "indirect") level = "listed";
      if (!where.includes(block.label)) where.push(block.label);
    } else if (STRONG_SECTIONS.includes(block.section) && !isWeak) {
      level = "demonstrated";
      if (!where.includes(block.label)) where.push(block.label);
    } else if (level === "absent") {
      level = "indirect";
      if (!where.includes(block.label)) where.push(block.label);
    }
  }

  if (level === "absent") {
    // Last chance: raw text (catches odd section names / unstructured resumes).
    const rawOcc = skillOccurrences(normalize(resume.rawText), skill);
    if (rawOcc.length) {
      weakContext = rawOcc.every((o) => WEAK_INTENT_RE.test(o.context));
      level = weakContext ? "indirect" : "listed";
      where.push("Resume text");
    }
  }

  return { level, where, weakContext };
}

/**
 * Evidence table for all JD skills, grouped by required vs preferred.
 */
export function buildSkillEvidence(resume, parsedJd) {
  const build = (skills) =>
    (skills ?? []).map((skill) => {
      const ev = classifySkillEvidence(resume, skill);
      return { skill, ...ev };
    });

  return {
    required: build(parsedJd.requiredSkills),
    preferred: build(parsedJd.preferredSkills),
  };
}

// ---------------------------------------------------------------------------
// Experience
// ---------------------------------------------------------------------------

const WORD_YEARS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10,
};

/**
 * Extract the explicit minimum years of experience demanded by the JD.
 * Returns a number or null (never guesses from unrelated content).
 */
export function extractRequiredYears(parsedJd) {
  const text = [
    ...(parsedJd.experienceRequirements ?? []),
    parsedJd.rawText ?? "",
  ].join("\n");
  let max = null;
  const re =
    /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:\+|or more|plus)?\s*(?:to\s*\d{1,2}\s*)?(?:years?|yrs?)\b/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const n = /^\d+$/.test(m[1])
      ? Number(m[1])
      : WORD_YEARS[m[1].toLowerCase()];
    if (Number.isFinite(n) && n > 0 && n <= 40) {
      max = max === null ? n : Math.max(max, n);
    }
  }
  return max;
}

/**
 * Total professional time span (in months) implied by the year ranges in the
 * resume's experience entries. Returns null when the resume has no usable
 * date ranges — we never infer years from education or unrelated content.
 */
export function extractResumeExperienceMonths(resume) {
  const nowYear = new Date().getFullYear();
  let totalDays = 0;
  let found = false;

  for (const e of resume.experience ?? []) {
    const text = [e.title, e.company, e.dates, e.startDate, e.endDate, ...(e.points ?? [])]
      .filter(Boolean)
      .join(" ");
    const re = new RegExp(
      `((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?\\s*)?(${YEAR})\\s*[-–—]\\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?\\s*)?((?:${YEAR})|present|current|now)`,
      "gi",
    );
    let m;
    while ((m = re.exec(text)) !== null) {
      const startYear = Number(m[2]);
      const endRaw = m[4].toLowerCase();
      const endYear =
        /^(?:present|current|now)$/.test(endRaw) ? nowYear : Number(endRaw);
      if (
        Number.isFinite(startYear) &&
        Number.isFinite(endYear) &&
        endYear >= startYear &&
        startYear >= 1970 &&
        endYear <= nowYear + 1
      ) {
        totalDays += (endYear - startYear) * 365;
        found = true;
      }
    }
  }

  if (!found) return null;
  return Math.round(totalDays / 30.44);
}

// ---------------------------------------------------------------------------
// Numbers in the resume (for the fabrication check)
// ---------------------------------------------------------------------------

/**
 * All distinct "meaningful" numbers present in the resume text, normalized.
 * Bare 4-digit years are excluded (date ranges are handled separately).
 */
export function extractResumeNumbers(resumeText) {
  const text = String(resumeText ?? "");
  const numbers = new Set();
  let m;
  NUMBER_RE.lastIndex = 0;
  while ((m = NUMBER_RE.exec(text)) !== null) {
    const token = m[0].trim().toLowerCase().replace(/\s+/g, " ");
    if (!token || /^\d{4}$/.test(token)) continue;
    numbers.add(token);
  }
  return numbers;
}
