/**
 * Prompt templates for the AI match-analysis service.
 *
 * Keeping prompts in one place documents the contract between the analysis logic
 * and Gemini and makes the prompts easy to iterate on.
 *
 * IMPORTANT for anti-hallucination: the prompt passes the fully-structured resume
 * plus its raw text, and the parsed job description plus its raw text, then
 * instructs the model to derive every claim strictly from that supplied evidence.
 */

const OUTPUT_SCHEMA = `{
  "matchScore": 0,
  "matchSummary": "",
  "strengths": [ { "title": "", "explanation": "", "evidence": [] } ],
  "missingSkills": [ { "skill": "", "importance": "high", "reason": "" } ],
  "partialMatches": [ { "requirement": "", "status": "partially_supported", "evidence": "", "gap": "" } ],
  "keywordAnalysis": { "matched": [], "missing": [] },
  "resumeIssues": [ { "section": "", "issue": "", "priority": "high", "recommendation": "" } ],
  "bulletSuggestions": [ { "section": "", "original": "", "suggestion": "", "reason": "" } ],
  "actionPlan": [ { "priority": 1, "action": "", "reason": "" } ]
}`;

/**
 * Render the deterministic evidence table (computed locally, before the AI
 * call) into a prompt section. The model must treat it as a starting point and
 * verify against the raw resume, but must never claim stronger evidence than
 * the table shows.
 */
function buildEvidenceBlock(evidence) {
  if (!evidence) return "";
  const line = (e) => {
    const where = e.where?.length ? ` (found in: ${e.where.join(", ")})` : "";
    const weak = e.weakContext ? " [only weak/aspirational mention]" : "";
    return `- ${e.skill}: ${e.level}${where}${weak}`;
  };
  const req = (evidence.required ?? []).map(line).join("\n");
  const pref = (evidence.preferred ?? []).map(line).join("\n");
  const exp = evidence.experience
    ? `\n- Experience: JD requires ~${evidence.experience.requiredYears} year(s); resume shows ~${evidence.experience.resumeMonths} month(s) of professional date ranges${evidence.experience.resumeMonths === null ? " (no usable employment date ranges found — do NOT estimate years)" : ""}`
    : "";

  return `--------------------
DETERMINISTIC EVIDENCE TABLE (computed by rule-based matching on the resume; verify against the raw text, never overstate)
--------------------
Required skills:
${req || "(none detected)"}
Preferred skills:
${pref || "(none detected)"}${exp}`;
}

/**
 * Build the full analysis prompt for a structured resume + parsed job description.
 *
 * @param {object} params
 * @param {object} params.resume - Structured resume from `resumeExtractor`.
 * @param {object} params.jobDescription - Parsed JD from `parseJobDescription`.
 * @returns {string}
 */
export function buildAnalysisPrompt({ resume, jobDescription, evidence }) {
  const structuredResume = JSON.stringify(resume ?? {}, null, 2);
  const rawResumeText = resume?.rawText ?? "";
  const structuredJd = JSON.stringify(jobDescription ?? {}, null, 2);
  const rawJdText = jobDescription?.rawText ?? "";
  const evidenceBlock = buildEvidenceBlock(evidence);

  return `You are an expert, objective technical resume reviewer and career coach.
Your job is to assess how well a candidate's EXISTING resume matches a SPECIFIC job
description, and to give the candidate an honest, evidence-based picture of that match
plus a prioritized improvement plan.

You will use the raw texts (which are authoritative) and the structured summaries
(which only help you navigate) provided below.

--------------------
STRUCTURED RESUME
--------------------
${structuredResume}

--------------------
RAW RESUME TEXT (authoritative source for what is actually on the resume)
--------------------
"""
${rawResumeText}
"""

--------------------
PARSED JOB DESCRIPTION
--------------------
${structuredJd}

--------------------
RAW JOB DESCRIPTION TEXT
--------------------
"""
${rawJdText}
"""
${evidenceBlock}
--------------------
STRICT RULES — READ CAREFULLY
--------------------
1. NEVER invent anything. Never invent a skill, experience, achievement,
   certification, metric, employment history, or claim a technology is known,
   unless the RAW RESUME TEXT explicitly supports it.
2. For every claimed strength or suggested addition, internally classify the
   supporting evidence as one of: SUPPORTED (only in the resume) or
   PARTIALLY_SUPPORTED (some evidence but not enough) or NOT_SUPPORTED (not in
   the resume at all).
3. If a skill/requirement is NOT_SUPPORTED, do NOT add it to "strengths". Instead
   recommend learning/improving it in "missingSkills" or "actionPlan".
4. Only use numbers already present in the resume. Never infer a percentage,
   metric, or impact. Do not turn "worked on a website" into "improved performance
   by 40%" unless that 40% exists verbatim in the resume.
5. "bulletSuggestions" must preserve factual accuracy: you may reword and clarify,
   but you must not add metrics, tools, or outcomes that are not in the resume.
6. Be honest. The goal is not to inflate the score; it is an honest evaluation.

--------------------
JOB MATCH SCORE (0-100) — "Job Match Score"
--------------------
This score is NOT an ATS score and must never be described as one — it is an
evidence-based estimate of how well the resume matches this job description.
Compute it with roughly these weights:
  - Required skills coverage (with real evidence): up to 50 points. Partial
    credit for skills demonstrated indirectly (e.g. used in a project); almost
    none for skills merely listed without supporting work.
  - Experience alignment (years and level): up to 20 points. Compare the JD's
    stated years requirement against the candidate's actual professional time
    (employment/project date ranges). A 6-month internship against a "5+ years"
    requirement must score very low here. Do NOT infer years of experience from
    education, certifications, coursework, or unrelated content.
  - Responsibility alignment: up to 15 points. Did the candidate actually do
    similar work to what the role requires day-to-day?
  - Preferred skills: up to 10 points. A missing preferred skill costs only a
    few points and must never weigh more than required-skill deficits.
  - Education: up to 5 points, only when the JD states a specific degree
    requirement.
Keyword matching alone must not produce a high score: a resume that merely
repeats job keywords without evidence of doing the work must stay low. The
score must be consistent with the deficits listed in missingSkills/
partialMatches: a candidate missing several required skills must not receive a
high score. When in doubt, be conservative.

--------------------
REQUIRED VS PREFERRED
--------------------
The parsed JD and the evidence table separate REQUIRED requirements (critical)
from PREFERRED ones (nice-to-have). Map them like this:
  - Required skill with no evidence → missingSkills, importance "high".
  - Required skill mentioned only indirectly (e.g. "interested in learning X",
    or named once with no supporting work) → importance "medium" with a reason
    explaining the evidence is insufficient, plus an entry in partialMatches.
  - Preferred skill with no evidence → importance "low" ("medium" only if it
    recurs across the JD). Never apply a major penalty for missing preferred
    skills.
  - Do NOT report trivial or generic words as missing skills.

--------------------
KEYWORDS
--------------------
- "matched": job terms that genuinely appear in the resume with supporting
  context.
- "missing": important job-specific terms genuinely absent from the resume.
  Recommend adding a keyword ONLY when the candidate has real, relevant
  experience or knowledge supporting it — suggesting unsupported keywords is
  keyword stuffing and must never happen.

--------------------
RESUME ISSUES
--------------------
Every issue must be SPECIFIC to this resume and this job — name the actual
section and what is concretely wrong, e.g. "Your project section describes
features but does not explain the technical implementation relevant to this
role." Never give generic advice like "improve your resume". Each issue needs
a section, the issue, a priority (high/medium/low), and a concrete
recommendation.

--------------------
ACTION PLAN
--------------------
Rank 1..n by real impact for THIS match: first close evidence gaps for required
skills, then fix high-priority resume issues, then build supported preferred
skills. Never recommend adding experience, technologies, certifications, or
achievements the candidate does not have — frame gaps as things to learn or
build, not things to write.

--------------------
ENUM VALUES — USE EXACTLY THESE
--------------------
- missingSkills[].importance: "high" | "medium" | "low"
- partialMatches[].status: "supported" | "partially_supported" | "not_supported"
- resumeIssues[].priority: "high" | "medium" | "low"
- actionPlan[].priority: an integer rank 1, 2, 3, ... (1 = highest impact)

--------------------
RESPONSE FORMAT
--------------------
Return ONLY a single valid JSON object (no markdown code fences, no explanation,
no commentary) matching EXACTLY this shape (you may include fewer array items but
keep the same keys and types):

${OUTPUT_SCHEMA}

Define:
- "matchScore": integer 0-100. "matchSummary": 2-3 sentence honest summary.
- "strengths": skills/experience clearly supported by the resume. "evidence" =
  quotes/citations from the raw resume. Empty evidence means it is not supported —
  move it elsewhere.
- "missingSkills": required skills the resume does NOT demonstrate. "importance":
  high for required, medium/low for preferred.
- "partialMatches": requirements with only some evidence. "status" =
  "partially_supported". "evidence": what supports it; "gap": what is missing.
- "keywordAnalysis": "matched" = job keywords/terms present in the resume;
  "missing" = important job-specific terms absent from the resume.
- "resumeIssues": layout/impact/clarity issues that hurt this resume for this job.
- "bulletSuggestions": improve existing bullets factually; quote the "original".
- "actionPlan": prioritized, concrete steps ranked by impact.`.trim();
}
