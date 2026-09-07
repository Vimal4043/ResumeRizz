import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-12 text-center sm:py-16">
      <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
        Resume & job-description match analysis
      </span>
      <h1 className="max-w-3xl text-3xl font-extrabold tracking-tight text-text-primary sm:text-4xl md:text-5xl">
        Get your resume past the{" "}
        <span className="text-primary">AI screening</span>
      </h1>
      <p className="mt-4 max-w-2xl text-base text-text-muted sm:text-lg">
        Upload a PDF resume and a job description. ResumeRizz compares them and
        gives you actionable suggestions to improve your match.
      </p>
      <div className="mt-8 flex w-full max-w-sm flex-col gap-3 sm:w-auto sm:max-w-none sm:flex-row">
        <Link
          to="/analyze"
          className="w-full rounded-md bg-primary px-5 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 sm:w-auto sm:py-2.5"
        >
          Analyze My Resume
        </Link>
        <Link
          to="/dashboard"
          className="w-full rounded-md border border-border bg-surface px-5 py-3 text-center text-sm font-medium text-text-secondary transition-colors hover:bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-primary sm:w-auto sm:py-2.5"
        >
          View dashboard
        </Link>
      </div>
    </div>
  );
}
