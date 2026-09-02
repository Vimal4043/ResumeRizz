import { MIN_JOB_DESCRIPTION_LENGTH } from "../../utils/constants.js";

/**
 * Job-description textarea with a clear placeholder, live character count, and
 * validation against the backend's minimum accepted length.
 */
export default function JobDescriptionInput({
  value,
  onChange,
  rows = 12,
  error,
  requiredError = "",
  placeholder,
}) {
  const length = value ? value.length : 0;
  const belowMin = length > 0 && length < MIN_JOB_DESCRIPTION_LENGTH;
  const overMin = length >= MIN_JOB_DESCRIPTION_LENGTH;
  const showError = error || requiredError || belowMin;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor="job-description"
        className="text-sm font-medium text-slate-700"
      >
        Job Description
      </label>
      <textarea
        id="job-description"
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          placeholder ??
          "Paste the full job description here, for example the duties and requirements from the job posting…"
        }
        className={`w-full resize-y rounded-md border px-3 py-2 text-sm leading-6 transition-colors focus:outline-none focus:ring-1 ${
          showError
            ? "border-red-500 focus:border-red-500 focus:ring-red-500"
            : "border-slate-300 focus:border-brand-700 focus:ring-brand-700"
        }`}
      />
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1">
          {error && (
            <p role="alert" className="text-xs font-medium text-red-600">
              {error}
            </p>
          )}
          {!error && requiredError && (
            <p role="alert" className="text-xs font-medium text-red-600">
              {requiredError}
            </p>
          )}
          {!error && !requiredError && belowMin && (
            <p role="alert" className="text-xs font-medium text-red-600">
              Job description is a little short — add at least{" "}
              {MIN_JOB_DESCRIPTION_LENGTH} characters.
            </p>
          )}
        </div>
        <p
          className={`shrink-0 text-xs ${
            overMin
              ? "text-slate-400"
              : belowMin
                ? "text-red-600"
                : "text-slate-400"
          }`}
        >
          {length.toLocaleString()} characters
        </p>
      </div>
    </div>
  );
}
