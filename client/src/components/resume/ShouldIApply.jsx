/**
 * "Should I apply?" recommendation.
 *
 * Deterministic CASE A / B / C rules derived ONLY from the actual analysis
 * data. Required requirements (importance "high") carry far more weight than
 * preferred ones (medium/low) — missing preferred skills alone must never
 * discourage the user from applying. This is an honest signal about
 * resume↔job fit — never a prediction of interview or hiring outcomes.
 */
const REQUIRED_IMPORTANCE = new Set(["high"]);

function deriveRecommendation(result) {
  const score = Math.min(Math.max(Number(result.matchScore) || 0, 0), 100);
  const missing = result.missingSkills ?? [];
  // Required/core gaps: only "high" importance counts against applying.
  const requiredGaps = missing.filter((s) => REQUIRED_IMPORTANCE.has(s.importance));
  // Preferred/nice-to-have gaps are informational, never blockers.
  const preferredGaps = missing.filter((s) => !REQUIRED_IMPORTANCE.has(s.importance));
  const highIssues = (result.resumeIssues ?? []).filter(
    (i) => i.priority === "high",
  );
  const strengths = result.strengths ?? [];

  let level;
  if (requiredGaps.length === 0 && score >= 60 && highIssues.length < 2) {
    // CASE A: meets core requirements (even with preferred gaps) → apply.
    level = "recommended";
  } else if (
    score >= 45 &&
    requiredGaps.length <= 3 &&
    highIssues.length <= 2
  ) {
    // CASE B: some required gaps, but still a reasonable match → improve first.
    level = "improve";
  } else {
    // CASE C: many critical gaps and/or weak overall match → low priority.
    level = "low";
  }

  const reasons = [];
  if (level === "recommended") {
    reasons.push(
      `Strong overall match — your resume scores ${score}/100 against this job description.`,
    );
    reasons.push(
      "No required skills for this role are missing from your resume.",
    );
    if (preferredGaps.length > 0) {
      reasons.push(
        `${preferredGaps.length} preferred skill${preferredGaps.length === 1 ? " is" : "s are"} not yet demonstrated — these could strengthen your application, but they are not blockers.`,
      );
    }
    if (strengths.length > 0) {
      reasons.push(
        `${strengths.length} clear strength${strengths.length === 1 ? "" : "s"} already support the core responsibilities of this role.`,
      );
    }
  } else if (level === "improve") {
    reasons.push(
      `Moderate match — your resume scores ${score}/100 against this job description.`,
    );
    const names = requiredGaps
      .slice(0, 3)
      .map((s) => s.skill)
      .join(", ");
    const more = requiredGaps.length > 3 ? ` and ${requiredGaps.length - 3} more` : "";
    reasons.push(
      `${requiredGaps.length} required skill${requiredGaps.length === 1 ? " is" : "s are"} not yet demonstrated: ${names}${more}. Closing ${requiredGaps.length === 1 ? "it" : "them"} before applying would strengthen your application.`,
    );
    if (highIssues.length > 0) {
      reasons.push(
        `${highIssues.length} high-priority resume issue${highIssues.length === 1 ? "" : "s"} worth fixing before you apply.`,
      );
    }
    if (strengths.length > 0) {
      reasons.push(
        `${strengths.length} clear strength${strengths.length === 1 ? "" : "s"} are already supported by your resume, so applying is still reasonable.`,
      );
    }
  } else {
    reasons.push(
      `Your resume scores ${score}/100 against this job description, so the fit is currently limited.`,
    );
    if (requiredGaps.length > 0) {
      const names = requiredGaps
        .slice(0, 3)
        .map((s) => s.skill)
        .join(", ");
      const more = requiredGaps.length > 3 ? ` and ${requiredGaps.length - 3} more` : "";
      reasons.push(
        `${requiredGaps.length} required skill${requiredGaps.length === 1 ? " is" : "s are"} missing: ${names}${more}.`,
      );
    }
    if (highIssues.length > 0) {
      reasons.push(
        `${highIssues.length} high-priority resume issue${highIssues.length === 1 ? "" : "s"} reduce${highIssues.length === 1 ? "s" : ""} your chances for this specific role.`,
      );
    }
  }

  return { level, reasons };
}

const LEVELS = {
  recommended: {
    badge: "Yes — apply now",
    mark: "✓",
    box: "border-success/40 bg-success-soft",
    badgeClass: "bg-success text-white",
    text: "text-text-primary",
    description:
      "You meet the core requirements for this role. The preferred gaps below could strengthen your application, but they should not prevent you from applying.",
  },
  improve: {
    badge: "Consider improving first",
    mark: "▲",
    box: "border-warning/40 bg-warning-soft",
    badgeClass: "bg-warning text-text-primary",
    text: "text-text-primary",
    description:
      "Applying now is reasonable, but closing the gaps below would strengthen your application.",
  },
  low: {
    badge: "Low-priority application",
    mark: "—",
    box: "border-danger/40 bg-danger-soft",
    badgeClass: "bg-danger text-white",
    text: "text-text-primary",
    description:
      "This role is currently a stretch. Focusing on closer matches — or building the gaps below — may be a better use of your time.",
  },
};

export default function ShouldIApply({ result }) {
  const { level, reasons } = deriveRecommendation(result ?? {});
  const config = LEVELS[level];

  return (
    <section
      aria-label="Should I apply recommendation"
      className={`rounded-xl border ${config.box} p-6`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className={`text-lg font-semibold ${config.text}`}>
          Should I apply?
        </h2>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${config.badgeClass}`}
        >
          <span aria-hidden="true">{config.mark}</span>
          {config.badge}
        </span>
      </div>
      <p className="mt-2 text-sm text-text-secondary">{config.description}</p>

      <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-text-muted">
        Why this recommendation
      </h3>
      <ul className="mt-2 space-y-1.5">
        {reasons.map((reason, index) => (
          <li
            key={index}
            className="flex items-start gap-2 text-sm text-text-secondary"
          >
            <span
              className="mt-2 h-1 w-1 shrink-0 rounded-full bg-text-muted"
              aria-hidden="true"
            />
            <span>{reason}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-text-muted">
        Based only on how your resume matches this job description — not a
        prediction of interview or hiring outcomes.
      </p>
    </section>
  );
}