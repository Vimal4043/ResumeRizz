/**
 * Deterministic, rule-based parser for job-description text.
 *
 * The AI analysis should not need to re-derive obvious facts from a JD — e.g.
 * whether a section lists responsibilities vs. requirements, or which items are
 * marked "preferred" — so we extract and structure those locally. This keeps the
 * Gemini call focused on the harder judgment work (comparing evidence, scoring)
 * and keeps behavior predictable.
 *
 * Everything here is best-effort and conservative: unknown headings are skipped,
 * and if a field can't be confidently extracted it is returned empty rather than
 * guessed. The original cleaned text is preserved (`rawText`) because the analysis
 * prompt still needs the full JD.
 */

const SECTION_HEADINGS = {
  responsibilities: [
    "responsibilities",
    "key responsibilities",
    "what you will do",
    "what you will be doing",
    "what you'll do",
    "what you'll be doing",
    "duties",
    "role overview",
    "about the role",
    "the role",
    "job description",
    "day to day",
    "day-to-day",
    "core responsibilities",
  ],
  requirements: [
    "requirements",
    "qualifications",
    "job requirements",
    "minimum qualifications",
    "you have",
    "you bring",
    "you will have",
    "you should have",
    "must have",
    "required",
    "about you",
    "skills and experience",
    "skills & experience",
    "experience and skills",
    "what we are looking for",
    "what we're looking for",
    "we are looking for",
    "we're looking for",
    "the ideal candidate",
    "what you need",
    "you need",
  ],
  preferred: [
    "preferred",
    "nice to have",
    "nice-to-have",
    "preferred qualifications",
    "preferred skills",
    "bonus",
    "bonus points",
    "good to have",
    "would be nice",
    "a plus",
    "are a plus",
    "plus",
    "desirable",
  ],
  skills: [
    "skills",
    "technical skills",
    "technologies",
    "tech stack",
    "key skills",
    "core skills",
    "technical requirements",
    "technical qualifications",
    "technology stack",
    "required skills",
    "proficiencies",
    "tools",
  ],
  education: [
    "education",
    "education requirements",
    "educational requirements",
    "education and experience",
    "degree requirements",
    "academic requirements",
  ],
  experience: [
    "experience",
    "experience requirements",
    "years of experience",
    "work experience",
    "professional experience",
    "experience level",
  ],
};

// Words/phrases that mark an item as "preferred/no hard requirement" when they
// appear at the start of a requirement line.
const PREFERRED_HINT =
  /^(?:(?:is\s+)?a\s+plus|plus|nice[- ]to[- ]have|good[- ]to[- ]have|preferred|bonus|desirable)\b/i;

const DEGREE_RE =
  /\b(?:A\.?S|A\.?A|B\.?S|B\.?A|B\.?Eng|B\.?Sc|M\.?S|M\.?A|M\.?Sc|M\.?Eng|MBA|Ph\.?D|PhD|Doctor|Bachelor(?:'s)?|Master(?:'s)?|Associate(?:'s)?|GED|High School|undergraduate|graduate)\b/i;

const EXPERIENCE_RE =
  /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|\+)\s*(?:\+)?\s*(?:to\s*)?[\d+]*\s*(?:years?|yrs?)\s*(?:of\s*(?:relevant\s*)?(?:professional\s*)?)?(?:experience|work)?\b/i;

/**
 * Known-technologies vocabulary used to pull concrete skill names out of
 * free-form requirement lines ("Experience with Node.js, React and AWS"). It is
 * purely a matching aid; nothing here ever gets asserted onto the resume.
 */
const KNOWN_SKILLS = [
  "javascript",
  "typescript",
  "node.js",
  "nodejs",
  "express",
  "next.js",
  "react",
  "react.js",
  "redux",
  "vue",
  "vue.js",
  "angular",
  "svelte",
  "html",
  "css",
  "scss",
  "tailwind",
  "bootstrap",
  "webpack",
  "vite",
  "jest",
  "mocha",
  "playwright",
  "cypress",
  "graphql",
  "rest",
  "rest api",
  "websockets",
  "python",
  "django",
  "flask",
  "fastapi",
  "java",
  "spring",
  "spring boot",
  "kotlin",
  "scala",
  "go",
  "golang",
  "rust",
  "c",
  "c++",
  "c#",
  ".net",
  "asp.net",
  "sql",
  "mysql",
  "postgresql",
  "postgres",
  "sqlite",
  "mongodb",
  "redis",
  "cassandra",
  "dynamodb",
  "elasticsearch",
  "oracle",
  "mssql",
  "firebase",
  "supabase",
  "aws",
  "amazon web services",
  "s3",
  "ec2",
  "lambda",
  "cloudfront",
  "route 53",
  "azure",
  "gcp",
  "google cloud",
  "google cloud platform",
  "terraform",
  "ansible",
  "docker",
  "kubernetes",
  "k8s",
  "helm",
  "jenkins",
  "github actions",
  "gitlab ci",
  "circleci",
  "nginx",
  "apache",
  "linux",
  "unix",
  "bash",
  "powershell",
  "git",
  "github",
  "gitlab",
  "bitbucket",
  "data structures",
  "algorithms",
  "oop",
  "object-oriented",
  "system design",
  "microservices",
  "event-driven",
  "kafka",
  "rabbitmq",
  "machine learning",
  "deep learning",
  "nlp",
  "natural language processing",
  "computer vision",
  "pandas",
  "numpy",
  "tensorflow",
  "pytorch",
  "scikit-learn",
  "sklearn",
  "airflow",
  "spark",
  "apache spark",
  "hadoop",
  "etl",
  "data analysis",
  "data pipelines",
  "tableau",
  "looker",
  "power bi",
  "excel",
  "agile",
  "scrum",
  "kanban",
  "jira",
  "confluence",
  "cicd",
  "ci/cd",
  "devops",
  "observability",
  "monitoring",
  "grafana",
  "prometheus",
  "datadog",
  "elk",
  "splunk",
  "api",
  "api design",
  "openapi",
  "swagger",
  "grpc",
  "testing",
  "tdd",
];

function clean(text) {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function normalizeHeading(line) {
  return line
    .replace(/^[\s\-–—•·▪*#>:]+/, "")
    .replace(/[\s\-–—•·▪*#]+$/, "")
    .replace(/[:.\n]+$/, "")
    .trim();
}

function detectSection(line) {
  const t = normalizeHeading(line);
  if (!t || t.length > 40) return null;
  const lower = t.toLowerCase();
  for (const [key, keywords] of Object.entries(SECTION_HEADINGS)) {
    if (keywords.some((k) => lower === k.toLowerCase())) return key;
  }
  return null;
}

// Group the doc into a header plus indexed sections [{ key, lines }].
function splitSections(lines) {
  const header = [];
  const sections = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (current) current.lines.push("");
      continue;
    }
    const key = detectSection(line);
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

function dedupe(arr) {
  return [...new Set(arr.map((s) => String(s).trim()).filter(Boolean))];
}

function stripBullet(line) {
  return line.replace(/^[\s\-–•·▪>*#]\s+/, "").trim();
}

// Split a "list" line into candidate tokens (commas, pipes, bullets, tabs).
function splitTokens(line) {
  return line
    .split(/[,;|•·▪●\t/]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => t.length > 1);
}

// Extract any known skill names that appear in a block of text.
function extractKnownSkills(text) {
  const lower = String(text).toLowerCase();
  const found = new Set();
  for (const skill of KNOWN_SKILLS) {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`).test(lower)) found.add(skill);
  }
  return [...found];
}

function findJobTitle(headerLines) {
  // "Title: Software Engineer" or "Job Title: ..."
  for (const line of headerLines) {
    const m = line.match(/^(?:job\s*)?title\s*[:：]\s*(.+)$/i);
    if (m) return m[1].trim();
  }
  // Otherwise the first short header line that isn't clearly a date range.
  const candidate = headerLines.find(
    (l) =>
      l.trim().length >= 2 && l.trim().length <= 60 && !/^\d{4}/.test(l.trim()),
  );
  return candidate ? candidate.trim() : "";
}

/**
 * Parse a job description into a structured, predictable object.
 * @param {string} [text] - Raw job-description text.
 */
export function parseJobDescription(text = "") {
  const rawText = clean(text);
  const lines = rawText ? rawText.split("\n") : [];
  const { header, sections } = splitSections(lines);

  const responsibilities = [];
  const requiredLines = [];
  const preferred = [];
  const experienceRequirements = [];
  const educationRequirements = [];
  let skillsTokens = [];

  for (const section of sections) {
    for (const raw of section.lines) {
      const line = stripBullet(raw);
      if (!line) continue;
      const t = line.replace(/^[^:：]{1,20}[:：]\s*/, ""); // drop inline "Skills:" labels
      if (!t) continue;

      switch (section.key) {
        case "responsibilities":
          responsibilities.push(t);
          break;
        case "skills":
          skillsTokens.push(...splitTokens(t));
          break;
        case "preferred":
          preferred.push(t);
          break;
        case "education":
          educationRequirements.push(t);
          break;
        case "experience":
          experienceRequirements.push(t);
          break;
        case "requirements":
          if (PREFERRED_HINT.test(t))
            preferred.push(t.replace(/^[^:：]{1,30}[:：]\s*/, ""));
          else requiredLines.push(t);
          break;
        default:
          break;
      }
    }
  }

  // Classify free-form requirement lines into experience/education/skill lines
  // using simple patterns, so we don't guess on ambiguous text.
  const requirementSkills = [];
  for (const line of requiredLines) {
    if (EXPERIENCE_RE.test(line)) {
      experienceRequirements.push(line);
    } else if (
      DEGREE_RE.test(line) ||
      /education|degree|school|university/i.test(line)
    ) {
      educationRequirements.push(line);
    } else {
      requirementSkills.push(line);
    }
  }

  const allText = `${header.join(" ")} ${sections
    .map((s) => s.lines.join(" "))
    .join(" ")}`;

  // Case-insensitive dedupe so "Node.js" and "node.js" don't both appear.
  function dedupeSkills(arr) {
    const seen = new Set();
    return arr.filter((s) => {
      const key = s.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  const literalTokens = dedupeSkills(
    dedupe([...skillsTokens, ...requirementSkills])
      .flatMap(splitTokens)
      .filter((t) => !/^\d/.test(t) && t.length > 1),
  );

  const requiredSkills = dedupeSkills([
    ...literalTokens,
    ...extractKnownSkills(
      `${allText} ${requiredLines.join(" ")} ${experienceRequirements.join(" ")} ${educationRequirements.join(" ")}`,
    ),
  ]);

  const preferredSkillTokens = preferred.flatMap((p) => [
    ...splitTokens(p),
    ...extractKnownSkills(p),
  ]);
  const preferredSkills = dedupeSkills(
    preferredSkillTokens.filter((t) => !/^\d/.test(t) && t.length > 1),
  );

  const keywords = dedupeSkills([
    ...requiredSkills,
    ...preferredSkills,
    ...extractKnownSkills(allText),
  ]);

  return {
    jobTitle: findJobTitle(header),
    requiredSkills,
    preferredSkills,
    responsibilities: dedupe(responsibilities),
    experienceRequirements: dedupe(experienceRequirements),
    educationRequirements: dedupe(educationRequirements),
    keywords,
    rawText,
  };
}

export function isValidJobDescription(text = "") {
  return clean(text).length >= 1;
}
