import { resumeExtractor } from "../resume/resumeExtractor.js";
import { parseJobDescription } from "../job/jobDescriptionParser.js";
import { buildAnalysisPrompt } from "./prompts.js";
import { gemini } from "./gemini.js";
import { validateAndNormalizeAnalysis } from "./analysisValidator.js";
import {
  buildSkillEvidence,
  extractRequiredYears,
  extractResumeExperienceMonths,
} from "./evidenceAnalyzer.js";
import { scrubAnalysis } from "./outputScrubber.js";
import { logger } from "../../utils/logger.js";

/**
 * High-level entry point for the resume ↔ job-description match analysis.
 *
 * Pipeline: upload → extract PDF text → structure resume → parse JD →
 * compute deterministic evidence (skills, experience, numbers) → build prompt
 * → ONE Gemini call → validate/normalize AI JSON → scrub output against the
 * resume ground truth → return.
 *
 * Everything that can be computed locally is computed locally — Gemini is
 * called exactly once per analysis.
 *
 * Only metadata is logged (never the full resume, JD, prompt, or Gemini response).
 */
export const analysisService = {
  /**
   * Analyze a resume file against a job description.
   * @param {object} params
   * @param {import('multer').Express.Multer.File} params.resumeFile - Uploaded, PDF-validated file.
   * @param {string} params.jobDescription - Raw job-description text.
   * @returns {Promise<object>} The validated analysis object.
   */
  async analyzeResume({ resumeFile, jobDescription }) {
    logger.info("Resume analysis started");

    // Extract + structure the resume (throws a ValidationError if the PDF has no
    // extractable text).
    const resume = await resumeExtractor.extract(resumeFile);
    logger.info("Resume text extracted");

    // Deterministically parse the job description for structure.
    const parsedJd = parseJobDescription(jobDescription);
    logger.info("JD parsed");

    // Deterministic evidence analysis (no AI): per-skill evidence levels,
    // JD experience requirement vs resume professional time, resume numbers.
    const evidence = {
      ...buildSkillEvidence(resume, parsedJd),
      experience: {
        requiredYears: extractRequiredYears(parsedJd),
        resumeMonths: extractResumeExperienceMonths(resume),
      },
    };
    logger.info("Deterministic evidence computed");

    // Build the anti-hallucination prompt from both structured inputs.
    const prompt = buildAnalysisPrompt({ resume, jobDescription: parsedJd, evidence });

    const raw = await gemini.generateContent(prompt);
    logger.info("Gemini request completed");

    // Never trust model output — validate/normalize into the canonical shape.
    let analysis = validateAndNormalizeAnalysis(raw);

    // Deterministic fact-check of the model output against the resume:
    // strip fabricated metrics, correct keyword lists.
    analysis = scrubAnalysis(analysis, resume.rawText);
    logger.info("Analysis validated and scrubbed");

    // Expose the parsed JD title and the structured resume so callers (e.g. the
    // controller that persists history) don't have to re-parse anything.
    return {
      analysis,
      jobTitle: parsedJd.jobTitle ?? "",
      structuredResume: { ...resume, rawText: undefined },
      resumeText: resume.rawText ?? "",
    };
  },
};

