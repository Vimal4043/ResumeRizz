import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageContainer from "../components/layout/PageContainer.jsx";
import EmptyState from "../components/common/EmptyState.jsx";
import Button from "../components/common/Button.jsx";
import Spinner from "../components/common/Spinner.jsx";
import {
  fetchAnalysisHistory,
  deleteAnalysis,
} from "../services/analysisService.js";
import { getErrorMessage } from "../services/api.js";

/** Score → tailwind color classes (honest, non-alarmist palette). */
function scoreClasses(score) {
  if (score >= 75) return "bg-emerald-100 text-emerald-800";
  if (score >= 50) return "bg-amber-100 text-amber-800";
  return "bg-rose-100 text-rose-800";
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

/**
 * Authenticated dashboard: the user's recent analyses (newest first) with
 * match score, job title, date, open and delete actions. All data comes from
 * the owner-scoped /api/analysis/history endpoint.
 */
export default function Dashboard() {
  const [state, setState] = useState({
    items: [],
    page: 1,
    totalPages: 1,
    total: 0,
    loading: true,
    error: "",
    deletingId: null,
  });

  const load = useCallback(async (page = 1) => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const data = await fetchAnalysisHistory({ page, limit: 10 });
      setState((s) => ({
        ...s,
        items: data.items,
        page: data.page,
        totalPages: data.totalPages,
        total: data.total,
        loading: false,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: getErrorMessage(err, "Could not load your analyses."),
      }));
    }
  }, []);

  useEffect(() => {
    load(1);
  }, [load]);

  async function handleDelete(id) {
    if (!window.confirm("Delete this analysis? This cannot be undone.")) return;
    setState((s) => ({ ...s, deletingId: id }));
    try {
      await deleteAnalysis(id);
      setState((s) => {
        const items = s.items.filter((a) => a.id !== id);
        // Refetch if the page became empty and there are earlier pages.
        if (!items.length && s.page > 1) {
          load(s.page - 1);
          return { ...s, deletingId: null };
        }
        return { ...s, items, total: s.total - 1, deletingId: null };
      });
    } catch (err) {
      setState((s) => ({
        ...s,
        deletingId: null,
        error: getErrorMessage(err, "Could not delete the analysis."),
      }));
    }
  }

  const hasAnalyses = state.items.length > 0;

  return (
    <PageContainer
      title="Dashboard"
      subtitle={
        state.total > 0
          ? `${state.total} saved ${state.total === 1 ? "analysis" : "analyses"}`
          : "Your job-hunting workspace"
      }
      actions={
        <Link to="/analyze">
          <Button>+ New analysis</Button>
        </Link>
      }
    >
      {state.error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {state.error}
        </div>
      )}

      {state.loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : !hasAnalyses ? (
        <EmptyState
          icon="🧠"
          title="No analyses yet"
          description="Upload a resume and paste a job description to generate your first match analysis and tailored suggestions."
          action={
            <Link to="/analyze">
              <Button>Start your first analysis</Button>
            </Link>
          }
        />
      ) : (
        <>
          <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {state.items.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-4 px-4 py-4 sm:px-6"
              >
                <span
                  className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-semibold ${scoreClasses(a.matchScore)}`}
                  title="Job Match Score"
                >
                  {a.matchScore}
                </span>

                <div className="min-w-0 flex-1">
                  <Link
                    to={`/analysis/${a.id}`}
                    className="block truncate font-medium text-slate-900 hover:text-indigo-600"
                  >
                    {a.jobTitle || "Untitled role"}
                  </Link>
                  <p className="truncate text-xs text-slate-500">
                    {formatDate(a.createdAt)}
                    {a.resumeName ? ` · ${a.resumeName}` : ""}
                  </p>
                  {a.matchSummary && (
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                      {a.matchSummary}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Link to={`/analysis/${a.id}`}>
                    <Button variant="secondary">Open</Button>
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDelete(a.id)}
                    disabled={state.deletingId === a.id}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                  >
                    {state.deletingId === a.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {state.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <Button
                variant="secondary"
                disabled={state.page <= 1}
                onClick={() => load(state.page - 1)}
              >
                ← Previous
              </Button>
              <span className="text-slate-500">
                Page {state.page} of {state.totalPages}
              </span>
              <Button
                variant="secondary"
                disabled={state.page >= state.totalPages}
                onClick={() => load(state.page + 1)}
              >
                Next →
              </Button>
            </div>
          )}
        </>
      )}
    </PageContainer>
  );
}

