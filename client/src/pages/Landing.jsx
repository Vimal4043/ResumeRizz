import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-16 text-center">
      <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
        Resume & job-description match analysis
      </span>
      <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight text-text-primary sm:text-5xl">
        Get your resume past the{" "}
        <span className="text-primary">AI screening</span>
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-text-muted">
        Upload a PDF resume and a job description. ResumeRizz compares them and
        gives you actionable suggestions to improve your match.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          to="/analyze"
          className="rounded-md bg-primary px-5 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          Analyze My Resume
        </Link>
        <Link
          to="/dashboard"
          className="rounded-md border border-border bg-surface px-5 py-2.5 text-center text-sm font-medium text-text-secondary transition-colors hover:bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-primary"
        >
          View dashboard
        </Link>
      </div>
    </div>
  );
}
