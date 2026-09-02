import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-16 text-center">
      <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
        Resume & job-description match analysis
      </span>
      <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
        Get your resume past the{" "}
        <span className="text-brand-700">AI screening</span>
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-slate-500">
        Upload a PDF resume and a job description. ResumeRizz compares them and
        gives you actionable suggestions to improve your match.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          to="/analyze"
          className="rounded-md bg-brand-700 px-5 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-700 focus:ring-offset-2"
        >
          Analyze My Resume
        </Link>
        <Link
          to="/dashboard"
          className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-center text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400"
        >
          View dashboard
        </Link>
      </div>
    </div>
  );
}
