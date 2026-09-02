import { extractTextFromPdf } from "./pdfParser.js";

// -----------------------------------------------------------------------------
// Conservative, best-effort normalization of raw resume text into a predictable
// structure (no Gemini, no database).
//
// Design notes:
//  - We never invent facts. If something cannot be confidently identified it is
//    left empty or kept as raw text.
//  - Skills are only sourced from a detected SKILLS section — a word occurring
//    in an unrelated paragraph is NOT treated as a skill.
//  - Section detection uses a small allow-list of headings. Unknown headings
//    fall through and their content is retained in `rawText`.
// -----------------------------------------------------------------------------

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE =
  /(?:(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/;
const LINK_RE =
  /(?:https?:\/\/|www\.)?[\w-]+\.(?:com|co|dev|io|org|app|me|net|gg|jobs|ai|bio)\b[^\s,]*/gi;
const YEAR = "(?:19|20)\\d{2}";
const DATE_RANGE_RE = new RegExp(
  `(${YEAR}\\s*[-–—]\\s*(${YEAR}|present|current|now))`,
  "i",
);
const LOCATION_RE = /^[A-Za-z][A-Za-z .'-]{1,},\s*[A-Za-z]{1,2}(?:\s+\d{4})?$/;
const DEGREE_RE =
  /\b(?:A\.?Sc|A\.?A|B\.?Sc|B\.?E|B\.?S|B\.?A|B\.?Eng|M\.?Sc|M\.?A|M\.?S|M\.?Eng|M\.?Phil|MBA|Ph\.?D|PhD|Doctor|Bachelor|Master|Associate|Grad)\b/i;
const INSTITUTION_HINT_RE =
  /\b(University|College|School|Institute|Academy)\b/i;

// Known SKILLS "category" labels that are not skills themselves (e.g. the line
// "Languages:") — dropped so we don't report them as skills.
const SKILL_CATEGORY_LABELS = new Set([
  "languages",
  "programming languages",
  "frameworks",
  "libraries",
  "tools",
  "technologies",
  "tech stack",
  "databases",
  "cloud",
  "platforms",
  "concepts",
  "skills",
  "competencies",
  "expertise",
  "devops",
  "interests",
  "certifications",
  "methodologies",
  "techniques",
  "database",
  "other",
  "misc",
  "additional",
]);

// -----------------------------------------------------------------------------
// Small helpers
// -----------------------------------------------------------------------------

function dedupe(arr) {
  return [...new Set(arr.map((s) => s.trim()).filter(Boolean))];
}

function stripBullet(line) {
  return line.replace(/^\s*[-–•·▪>*#]\s+/, "").trim();
}

function isBullet(line) {
  return /^[-–•·▪>*#]\s+|\s+[-–•·▪]+$/.test(line.trim());
}

// Group consecutive lines into blocks separated by blank lines.
function splitIntoGroups(lines) {
  const groups = [[]];
  for (const line of lines) {
    if (line.trim() === "") {
      if (groups[groups.length - 1].length) groups.push([]);
      continue;
    }
    groups[groups.length - 1].push(line);
  }
  return groups.filter((g) => g.length);
}

// -----------------------------------------------------------------------------
// Section detection
// -----------------------------------------------------------------------------

const SECTION_KEYWORDS = {
  summary: [
    "summary",
    "professional summary",
    "profile",
    "professional profile",
    "objective",
    "career summary",
    "overview",
    "about me",
    "about",
  ],
  skills: [
    "skills",
    "technical skills",
    "core competencies",
    "technologies",
    "tech stack",
    "expertise",
    "toolbox",
  ],
  experience: [
    "experience",
    "professional experience",
    "work experience",
    "employment history",
    "employment experience",
    "work history",
    "career history",
    "internship",
    "internships",
    "internship experience",
  ],
  education: [
    "education",
    "academic background",
    "academic history",
    "academic",
  ],
  projects: [
    "projects",
    "project experience",
    "selected projects",
    "personal projects",
    "portfolio",
    "key projects",
  ],
  certifications: [
    "certifications",
    "certificates",
    "certification",
    "licenses",
  ],
  achievements: [
    "achievements",
    "awards",
    "honors",
    "accomplishments",
    "highlights",
  ],
};

// Normalize a candidate line (strip decorations + trailing punctuation).
function normalizeHeading(line) {
  return line
    .replace(/^[\s\-–—•·▪*#>:]+/, "")
    .replace(/[\s\-–—•·▪*#]+$/, "")
    .replace(/[:.\n]+$/, "")
    .trim();
}

// Return a section key if `line` looks like a known section heading, else null.
function detectHeading(line) {
  const t = normalizeHeading(line);
  if (!t || t.length > 40) return null;
  const lower = t.toLowerCase();
  for (const [key, keywords] of Object.entries(SECTION_KEYWORDS)) {
    if (keywords.some((k) => lower === k.toLowerCase())) return key;
  }
  return null;
}

/**
 * Split the full text into a header (everything above the first section heading)
 * and an array of sections: [{ key, lines }].
 */
function splitSections(text) {
  const rawLines = text.split("\n");
  const header = [];
  const sections = [];
  let current = null;
  for (const raw of rawLines) {
    const line = raw.trim();
    if (!line) {
      if (current) current.lines.push("");
      continue;
    }
    const key = detectHeading(line);
    if (key) {
      current = { key, lines: [] };
      sections.push(current);
      continue;
    }
    if (current) current.lines.push(line);
    else header.push(line);
  }
  return { header, sections };
}
// -----------------------------------------------------------------------------
// Contact information
// -----------------------------------------------------------------------------

function parseContact(headerLines) {
  const contact = { name: "", email: "", phone: "", location: "", links: [] };

  // Collect every distinct field independently so a combined
  // "email | phone | location" line still yields all parts.
  for (const raw of headerLines) {
    const line = raw.trim();
    if (!line) continue;
    const email = line.match(EMAIL_RE);
    if (email && !contact.email) contact.email = email[0];
    const phone = line.match(PHONE_RE);
    const likelyDate = /[0-9]{4}\s*[-–]\s*([0-9]{4}|present|now)\b/i.test(line);
    if (phone && !contact.phone && !likelyDate) contact.phone = phone[0];
    // All links in the line (match(), not matchAll(), only returns the first).
    const links = line.matchAll(LINK_RE);
    for (const m of links) contact.links.push(m[0]);
    // Location may be one segment of a combined "… | Boston, MA" line.
    if (!contact.location) {
      const seg = line
        .split(/[|;]\s*/)
        .map((s) => s.trim())
        .find((s) => LOCATION_RE.test(s));
      if (seg) contact.location = seg;
    }
  }

  // Drop URL fragments that are actually just the domain of the captured email
  // (e.g. "alice@email.com" must not produce a "email.com" link).
  if (contact.email) {
    const domain = contact.email.split("@")[1];
    contact.links = contact.links.filter((l) => !domain || !l.includes(domain));
  }
  contact.links = dedupe(contact.links);

  // Name: the first line that is not purely a contact artifact.
  contact.name =
    headerLines
      .find(
        (l) =>
          !EMAIL_RE.test(l) &&
          !PHONE_RE.test(l) &&
          !LOCATION_RE.test(l) &&
          l.length >= 2 &&
          l.length <= 60 &&
          !l.includes("|") &&
          !isBullet(l),
      )
      ?.trim() || "";
  return contact;
}
// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------

function parseSummary(lines) {
  return lines
    .filter((l) => l.trim() && !isBullet(l))
    .map((l) => l.trim())
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// -----------------------------------------------------------------------------
// Skills
// -----------------------------------------------------------------------------

// Split a skills line into candidate tokens (handles "a, b, c", "a | b | c",
// "Languages: Python, SQL", recipe-style bullet lists, etc.)
function splitSkillLine(line) {
  // Separate a category label before a ':' or '–' (e.g. "Languages: ...")
  let rest = line;
  const labelMatch = rest.match(/^([^:：|,]+)\s*[:：]\s*(.*)$/);
  if (
    labelMatch &&
    SKILL_CATEGORY_LABELS.has(labelMatch[1].trim().toLowerCase())
  ) {
    rest = labelMatch[2];
  }
  return rest
    .split(/[,|;•·●▪\t/]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => t.length > 1)
    .filter((t) => !SKILL_CATEGORY_LABELS.has(t.toLowerCase()));
}

function parseSkills(lines) {
  const skills = [];
  for (const raw of lines) {
    const line = stripBullet(raw);
    if (!line) continue;
    skills.push(...splitSkillLine(line));
  }
  return dedupe(skills);
}
// -----------------------------------------------------------------------------
// Shared content-block helpers (experience, education, projects...)
// -----------------------------------------------------------------------------

function extractDateText(text) {
  const parts = [];
  const mm = text.matchAll(
    /(?:(?:19|20)\d{2})\s*[-–—]\s*(?:(?:19|20)\d{2}|present|current|now)/gi,
  );
  for (const m of mm) parts.push(m[0]);
  const single = text.match(/(?:19|20)\d{2}/g) || [];
  for (const y of single) if (!parts.some((p) => p.includes(y))) parts.push(y);
  return dedupe(parts);
}

// Best-effort: extract an optional date-range/date region from a heading line.
function stripDates(text) {
  return text
    .replace(/\s*\[\s*[^\]]*\d{4}[^\]]*\s*\]\s*/gi, " ")
    .replace(
      /\(?(?:(?:19|20)\d{2}\s*[-–—]\s*(?:(?:19|20)\d{2}|present|current|now))\)?/gi,
      " ",
    )
    .replace(/\b(?:19|20)\d{2}\s*[-–—]\s*(?:19|20)\d{2}\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Split a job/education heading into title + company (+ location if present).
// Uses strong delimiters only; otherwise leaves the whole string as the title
// rather than guessing.
function splitRoleLine(text) {
  let t = stripDates(text).trim();
  const result = { title: "", company: "", location: "" };
  if (!t) return result;

  // "Title at Company" / "Title @ Company"
  const at = t.match(/^(.*?)\s+(?:at|@)\s+(.+)$/i);
  if (at) {
    result.title = at[1].trim();
    result.company = at[2].trim();
    return result;
  }

  // "Title | Company" (company may contain a comma; location often trailing)
  const pipe = t
    .split(/\s*\|\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (pipe.length >= 2) {
    result.title = pipe[0];
    result.company = pipe.slice(1).join(" | ");
    return result;
  }

  // "Title —/–/ - Company"
  const dash = t.match(/^(.*?)\s+[-–—]\s+(.+)$/);
  if (dash) {
    result.title = dash[1].trim();
    result.company = dash[2].trim();
    return result;
  }

  result.title = t;
  return result;
}
// -----------------------------------------------------------------------------
// Experience
// -----------------------------------------------------------------------------

// A line starts a new experience entry when it has a structured role header:
// a date, a "|" field separator, " at "/"@", or an en/em-dash separator — and it
// is not itself a bullet point.
function looksLikeHeader(line) {
  if (!line.trim() || isBullet(line)) return false;
  if (/(?:19|20)\d{2}/.test(line)) return true;
  if (line.includes("|")) return true;
  if (/\s+(?:at|@)\s+/i.test(line)) return true;
  if (/\s+[-–—]\s+/.test(line)) return true;
  return false;
}

function parseExperience(lines) {
  const entries = [];
  let current = null;
  const push = () => {
    if (current) entries.push(current);
  };

  for (const raw of lines) {
    if (!raw.trim()) continue;
    const text = stripBullet(raw).trim();
    if (!text) continue;

    if (isBullet(raw)) {
      if (!current)
        current = {
          title: "",
          company: "",
          location: "",
          dates: "",
          points: [text],
        };
      else current.points.push(text);
    } else if (looksLikeHeader(text)) {
      push();
      const parts = splitRoleLine(text);
      current = {
        title: parts.title,
        company: parts.company,
        location: parts.location,
        dates: extractDateText(text).join(" – "),
        points: [],
      };
    } else {
      // Non-bullet continuation/header-like line with no obvious structure.
      if (!current)
        current = {
          title: text,
          company: "",
          location: "",
          dates: "",
          points: [],
        };
      else current.points.push(text);
    }
  }
  push();
  return entries;
}

// -----------------------------------------------------------------------------
// Education
// -----------------------------------------------------------------------------

function findDegree(text) {
  const m = text.match(DEGREE_RE);
  if (!m) return "";
  // Degree = the token + following words up to a separator (comma, pipe, paren,
  // dash, run of whitespace) or end of string.
  const tail = text.slice(m.index);
  const end = tail.search(/[,(|]|\s+[-–—]\s+|\s{2,}/);
  return (end === -1 ? tail : tail.slice(0, end)).trim();
}

function findInstitution(text) {
  const m = text.match(INSTITUTION_HINT_RE);
  if (!m) return "";
  const after = text.slice(m.index);
  // School name runs from the hint up to a comma / opening paren / year separator.
  const cut = after.split(/,\(|\(|,/)[0].trim();
  const beforeSlice = text.slice(0, m.index).trim().split(/\s+/);
  const prevWord = beforeSlice[beforeSlice.length - 1];
  const prefix = prevWord && !/[,(;:]/.test(prevWord) ? `${prevWord} ` : "";
  return (prefix + cut).trim();
}

function parseEducation(lines) {
  const entries = [];
  for (const group of splitIntoGroups(lines)) {
    if (!group.length) continue;
    const block = group
      .join(" ")
      .replace(/\s{2,}/g, " ")
      .trim();
    const dates = extractDateText(block);
    const degree = findDegree(block);
    let institution = "";
    if (INSTITUTION_HINT_RE.test(block)) institution = findInstitution(block);

    entries.push({
      degree,
      institution,
      location: "",
      dates: dates.join(" – "),
      // Conservative fallback: keep the raw block if nothing could be identified.
      details: degree === "" && institution === "" ? [block] : [],
    });
  }
  return entries;
}

// -----------------------------------------------------------------------------
// Projects
// -----------------------------------------------------------------------------

function parseProjects(lines) {
  const entries = [];
  for (const group of splitIntoGroups(lines)) {
    if (!group.length) continue;
    const name = stripBullet(group[0]).trim();
    const body = group
      .slice(1)
      .map((l) => l.trim())
      .filter(Boolean);
    const link =
      (body.join(" ") + " " + (body.includes("link") ? name : "")).match(
        /(?:https?:\/\/|www\.)?[\w-]+\.(?:com|co|dev|io|org|app|me|net|gg|jobs|ai)[\/\w.-]*/i,
      )?.[0] || "";
    const techLine = body.find((l) =>
      /^(tech(?:nologies)?|stack|keywords|built with)\s*[:：]/i.test(l),
    );
    const technologies = techLine
      ? splitSkillLine(techLine.replace(/^[^:：]*[:：]\s*/, ""))
      : [];

    entries.push({
      name,
      description: body.filter((l) => l !== techLine).join(" "),
      link,
      technologies,
    });
  }
  return entries;
}
// -----------------------------------------------------------------------------
// Certifications
// -----------------------------------------------------------------------------

function parseCertifications(lines) {
  const entries = [];
  for (const group of splitIntoGroups(lines)) {
    for (const raw of group) {
      const line = stripBullet(raw).trim();
      if (!line) continue;
      const dates = extractDateText(line);
      const name = stripDates(line);
      entries.push({
        name: name || line,
        issuer: "",
        dates: dates.join(" – "),
      });
    }
  }
  return entries;
}

// -----------------------------------------------------------------------------
// Achievements / Awards
// -----------------------------------------------------------------------------

function parseAchievements(lines) {
  const entries = [];
  for (const group of splitIntoGroups(lines)) {
    for (const raw of group) {
      const line = stripBullet(raw).trim();
      if (!line) continue;
      // Optional "Title: description"
      const colon = line.match(/^([^:]{2,40}):\s*(.+)$/);
      if (colon)
        entries.push({ title: colon[1].trim(), description: colon[2].trim() });
      else entries.push({ title: line, description: "" });
    }
  }
  return entries;
}

// -----------------------------------------------------------------------------
// Orchestration
// -----------------------------------------------------------------------------

const EMPTY = () => ({
  contact: { name: "", email: "", phone: "", location: "", links: [] },
  summary: "",
  skills: [],
  experience: [],
  education: [],
  projects: [],
  certifications: [],
  achievements: [],
  rawText: "",
});

/**
 * Normalize raw resume text into the structured representation.
 * @param {string} text
 * @returns {object}
 */
export function parseResume(text = "") {
  const { header, sections } = splitSections(text);
  const parsed = EMPTY();
  parsed.rawText = text.trim();

  parsed.contact = parseContact(header);

  for (const section of sections) {
    switch (section.key) {
      case "summary":
        parsed.summary = parseSummary(section.lines);
        break;
      case "skills":
        parsed.skills = parseSkills(section.lines);
        break;
      case "experience":
        parsed.experience = parseExperience(section.lines);
        break;
      case "education":
        parsed.education = parseEducation(section.lines);
        break;
      case "projects":
        parsed.projects = parseProjects(section.lines);
        break;
      case "certifications":
        parsed.certifications = parseCertifications(section.lines);
        break;
      case "achievements":
        parsed.achievements = parseAchievements(section.lines);
        break;
      default:
        break;
    }
  }

  return parsed;
}

// Controllers call this entry point; they never touch PDF details directly.
export const resumeExtractor = {
  /**
   * Extract + normalize a resume upload.
   * @param {import('multer').Express.Multer.File} file
   */
  async extract(file) {
    const rawText = await extractTextFromPdf(file.path);
    return parseResume(rawText);
  },
};
