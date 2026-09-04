import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import PageContainer from "../components/layout/PageContainer.jsx";
import EmptyState from "../components/common/EmptyState.jsx";
import Button from "../components/common/Button.jsx";
import Spinner from "../components/common/Spinner.jsx";
import MatchScore from "../components/resume/MatchScore.jsx";
import ShouldIApply from "../components/resume/ShouldIApply.jsx";
import TopPriorities from "../components/resume/TopPriorities.jsx";
import StrengthsCard from "../components/resume/StrengthsCard.jsx";
import MissingSkillsCard from "../components/resume/MissingSkillsCard.jsx";
import PartialMatches from "../components/resume/PartialMatches.jsx";
import KeywordAnalysis from "../components/resume/KeywordAnalysis.jsx";
import ResumeIssues from "../components/resume/ResumeIssues.jsx";
import BulletSuggestions from "../components/resume/BulletSuggestions.jsx";
import ActionPlan from "../components/resume/ActionPlan.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { fetchAnalysisById } from "../services/analysisService.js";
import { getErrorMessage } from "../services/api.js";

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

/** Metadata row for the saved-analysis details panel. */
function DetailRow({ label, value }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </span>
      <span className="min-w-0 truncate text-sm text-text-primary" title={value}>
        {value}
      </span>
    </div>
  );
}

/**
 * Renders the real analysis returned by the backend.
 *
 * Source resolution:
 *  - In-memory result passed via router navigation state (no extra request,
 *    keeps the fresh-analysis flow snappy).
 *  - Otherwise, when the route has an :id param (e.g. /analysis/:id opened from
 *    the dashboard, or a direct link/refresh), fetch the saved analysis.
 *  - If neither is available, show a clear call-to-action.
 */
export default function AnalysisResult() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const { user } = useAuth();
  const routedResult = location.state?.result ?? null;

  const [result, setResult] = useState(routedResult);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(Boolean(id) && !routedResult);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id || routedResult) return;
    // eslint-disable-next-line no-codec
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchAnalysisById(id);
        // Backend returns { id, jobTitle, jobDescription, matchScore, analysis,
        // resumeName, createdAt } — `analysis` holds the report itself, the rest
        // is metadata shown in the details panel.
        setResult(data.analysis ?? data);
        setMeta(data);
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, "Could not load this analysis."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, routedResult]);

  const startNewAnalysis = () => navigate("/analyze", { replace: true });

  if (loading) {
    return (
      <PageContainer title="Analysis Result">
        <div className="flex min-h-[40vh] items-center justify-center">
          <Spinner size="lg" />
        </div>
      </PageContainer>
    );
  }

  if (!result) {
    return (
      <PageContainer title="Analysis Result">
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger-text"
          >
            {error}
          </div>
        )}
        <EmptyState
          icon="📊"
          title={error ? "Could not load analysis" : "No analysis results yet"}
          description={
            error
              ? error
              : "Run an analysis on the Resume Analyzer page to see your Job Match Score, strengths, missing skills, and a prioritized action plan here."
          }
          action={
            <Link to="/analyze">
              <Button>Analyze My Resume</Button>
            </Link>
          }
        />
      </PageContainer>
    );
  }

  const hasAnyResult =
    result.matchScore != null ||
    result.matchSummary ||
    (Array.isArray(result.strengths) && result.strengths.length) ||
    (Array.isArray(result.missingSkills) && result.missingSkills.length) ||
    (Array.isArray(result.partialMatches) && result.partialMatches.length) ||
    result.keywordAnalysis?.matched?.length ||
    result.keywordAnalysis?.missing?.length ||
    (Array.isArray(result.resumeIssues) && result.resumeIssues.length) ||
    (Array.isArray(result.bulletSuggestions) &&
      result.bulletSuggestions.length) ||
    (Array.isArray(result.actionPlan) && result.actionPlan.length);

  // "saved" is true when the backend persisted this run to the logged-in user's
  // account; guests get saved=false and no analysisId. A page opened on a saved
  // /analysis/:id is inherently saved, so we never show the CTA there.
  const isSavedView = Boolean(id);
  const savedToAccount = result.saved === true;

  return (
    <PageContainer
      title="Your Job Match Analysis"
      subtitle="An honest look at how your resume fits this job — and what to change."
      actions={
        <Button variant="secondary" onClick={startNewAnalysis}>
          Analyze another job
        </Button>
      }
    >
      {!hasAnyResult ? (
        <EmptyState
          icon="🧩"
          title="This analysis is empty"
          description="The backend returned a response without usable results. Please run the analysis again."
          action={
            <Button onClick={startNewAnalysis}>Analyze another job</Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {isSavedView && meta && (
            <section
              aria-label="Analysis details"
              className="rounded-xl border border-border bg-surface p-5"
            >
              <h2 className="text-sm font-semibold text-text-primary">
                Analysis details
              </h2>
              <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                <DetailRow
                  label="Job"
                  value={meta.jobTitle || "Untitled role"}
                />
                <DetailRow
                  label="Resume"
                  value={meta.resumeName || "Unknown file"}
                />
                <DetailRow
                  label="Analyzed"
                  value={meta.createdAt ? formatDate(meta.createdAt) : "—"}
                />
              </dl>
            </section>
          )}

          {savedToAccount && (
            <div
              role="status"
              className="rounded-lg border border-success/40 bg-success-soft px-4 py-3 text-sm text-success-text"
            >
              ✓ Analysis saved to your account.
            </div>
          )}

          {!savedToAccount && !isSavedView && (
            <div className="rounded-lg border border-primary/40 bg-primary-soft p-5">
              <p className="font-semibold text-text-primary">
                {user ? "Save this analysis" : "Save this analysis"}
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                {user
                  ? "Your results weren't saved automatically. Please try the analysis again."
                  : "Create a free account to save this analysis and access it later."}
              </p>
              {!user && (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <Link to="/register">
                    <Button>Create free account</Button>
                  </Link>
                  <Link
                    to="/login"
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Log in
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Top summary: score + recommendation, side by side on desktop. */}
          <div className="grid gap-6">
            <div className="lg:col-span-2">
              <MatchScore score={result.matchScore} summary={result.matchSummary} />
            </div>
            <div className="lg:col-span-3">
              <ShouldIApply result={result} />
            </div>
          </div>

          <TopPriorities result={result} />
          <StrengthsCard strengths={result.strengths} />
          <MissingSkillsCard missingSkills={result.missingSkills} />
          <PartialMatches partialMatches={result.partialMatches} />
          <KeywordAnalysis analysis={result.keywordAnalysis} />
          <ResumeIssues issues={result.resumeIssues} />
          <BulletSuggestions suggestions={result.bulletSuggestions} />
          <ActionPlan plan={result.actionPlan} />
        </div>
      )}
    </PageContainer>
  );
}
