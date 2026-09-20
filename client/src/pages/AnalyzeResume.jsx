import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageContainer from "../components/layout/PageContainer.jsx";
import ResumeUploader from "../components/resume/ResumeUploader.jsx";
import JobDescriptionInput from "../components/resume/JobDescriptionInput.jsx";
import AnalysisProgress from "../components/resume/AnalysisProgress.jsx";
import Button from "../components/common/Button.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useResumeAnalysis } from "../hooks/useResumeAnalysis.js";
import {
  MIN_JOB_DESCRIPTION_LENGTH,
  MAX_JOB_DESCRIPTION_LENGTH,
  ANALYSIS_INPUT_ERROR_HINTS,
  isInputError,
} from "../utils/constants.js";
import {
  ANALYSIS_LIMIT_CODE,
  ANALYSIS_LIMIT_MESSAGE,
} from "../utils/analysisLimit.js";

export default function AnalyzeResume() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [file, setFile] = useState(null);
  const [jobDescription, setJobDescription] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  // The daily limit is per identity: the signed-in user's id, or null for guests.
  const { status, stage, error, limitReached, analyze } = useResumeAnalysis(
    user?.id ?? null,
  );
  // Synchronous guard so a double-click can never fire two requests: state
  // updates are async, so `loading` alone cannot stop back-to-back clicks
  // within the same tick.
  const submittingRef = useRef(false);

  const loading = status === "loading";

  // A valid PDF is any file the uploader accepted (it already validates type/size).
  const hasValidFile = Boolean(file);
  const jobDescriptionLength = jobDescription.trim().length;
  const hasValidJobDescription =
    jobDescriptionLength >= MIN_JOB_DESCRIPTION_LENGTH &&
    jobDescriptionLength <= MAX_JOB_DESCRIPTION_LENGTH;
  const canSubmit =
    hasValidFile && hasValidJobDescription && !loading && !limitReached;

  // The hook refused the attempt because today's analysis is already used.
  const limitBlocked = status === "error" && error?.code === ANALYSIS_LIMIT_CODE;
  const showLimitNotice = limitBlocked || (limitReached && status !== "error");

  function handleFileChange(nextFile) {
    setFile(nextFile);
    // Clear the field error as soon as the user makes a (valid) choice.
    setFieldErrors((prev) => ({ ...prev, file: "" }));
  }

  function handleJobDescriptionChange(value) {
    setJobDescription(value);
    setFieldErrors((prev) => ({ ...prev, jobDescription: "" }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    // Block duplicate submissions with the in-flight ref guard. The daily limit
    // is re-checked inside the hook before the request is sent.
    if (submittingRef.current) return;
    if (!hasValidFile || !hasValidJobDescription) {
      const nextErrors = {
        file: hasValidFile ? "" : "Please choose a valid PDF resume.",
        jobDescription:
          jobDescriptionLength > MAX_JOB_DESCRIPTION_LENGTH
            ? `Job description must be at most ${MAX_JOB_DESCRIPTION_LENGTH.toLocaleString()} characters.`
            : `Job description must be at least ${MIN_JOB_DESCRIPTION_LENGTH} characters.`,
      };
      setFieldErrors(nextErrors);
      return;
    }

    submittingRef.current = true;
    try {
      const result = await analyze(file, jobDescription.trim());
      // Pass the real analysis to the results page via navigation state (not the URL).
      navigate("/analysis", { state: { result } });
    } catch {
      // Error (including the client-side daily limit) is surfaced through the
      // hook's `error` state.
    } finally {
      submittingRef.current = false;
    }
  }

  if (loading) {
    return (
      <PageContainer title="Analyzing your resume">
        <AnalysisProgress stage={stage} />
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="Resume Analyzer"
      subtitle="Upload your resume, paste a job description, and get an honest match analysis you can act on."
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-6 sm:space-y-8">
        <div className="space-y-6 rounded-xl border border-border bg-surface p-6">
          <ResumeUploader
            file={file}
            onChange={handleFileChange}
            disabled={loading}
            requiredError={fieldErrors.file}
          />

          <JobDescriptionInput
            value={jobDescription}
            onChange={handleJobDescriptionChange}
            error={fieldErrors.jobDescription}
          />
        </div>

        {showLimitNotice && (
          <div
            role="alert"
            className="rounded-md border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger-text"
          >
            <p className="font-medium">{ANALYSIS_LIMIT_MESSAGE}</p>
          </div>
        )}

        {status === "error" && error && !limitBlocked && (
          <div
            role="alert"
            className="rounded-md border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger-text"
          >
            <p className="font-semibold">We couldn't complete the analysis.</p>
            {/* ONE clear message describing the actual failure - the generic
                "check your PDF/JD" hint is intentionally NOT appended here. */}
            <p className="mt-1">{error.message}</p>
            {/* Contextual next step ONLY for input (resume/JD) errors. */}
            {isInputError(error.code) && (
              <p className="mt-1 text-xs text-danger-text">
                {ANALYSIS_INPUT_ERROR_HINTS[error.code]}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-text-muted">
            {!hasValidFile && "Select a PDF resume. "}
            {!hasValidJobDescription && "Add a fuller job description. "}
            {hasValidFile && hasValidJobDescription && !limitReached && "Ready to analyze."}
          </p>
          <Button
            type="submit"
            disabled={!canSubmit}
            loading={loading}
            className="w-full sm:w-auto"
          >
            Analyze My Resume
          </Button>
        </div>
      </form>
    </PageContainer>
  );
}
