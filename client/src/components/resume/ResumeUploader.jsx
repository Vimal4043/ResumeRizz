import { useRef, useState } from "react";
import { formatFileSize } from "../../utils/formatters.js";
import {
  ALLOWED_RESUME_TYPES,
  MAX_FILE_SIZE_BYTES,
} from "../../utils/constants.js";

function validateFile(file) {
  if (!ALLOWED_RESUME_TYPES.includes(file.type) && !/\.pdf$/i.test(file.name)) {
    return "Only PDF files are allowed. Please choose a .pdf resume.";
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `File is over the 5 MB limit (${formatFileSize(file.size)}). Please choose a smaller PDF.`;
  }
  return "";
}

/**
 * PDF resume uploader with drag-and-drop, click-to-upload, inline validation,
 * filename preview, and a remove/change action. Validation errors clear the
 * moment a valid file is chosen; choosing an invalid file resets the selection.
 *
 * Props:
 *  - file: the currently selected File (or null)
 *  - onChange(file | null): called with the valid file, or null when cleared
 *  - requiredError: an external "please choose a resume" message from the parent
 *  - disabled
 */
export default function ResumeUploader({
  file,
  onChange,
  disabled = false,
  requiredError = "",
}) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [validationError, setValidationError] = useState("");

  function handleFile(candidate) {
    if (!candidate) return;
    const message = validateFile(candidate);
    if (message) {
      setValidationError(message);
      onChange(null);
      return;
    }
    setValidationError("");
    onChange(candidate);
  }

  function clearFile() {
    setValidationError("");
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function openPicker() {
    if (!disabled) inputRef.current?.click();
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragOver(false);
    if (disabled) return;
    handleFile(event.dataTransfer.files?.[0]);
  }

  const showError = validationError || requiredError;

  function pickerClass() {
    const base =
      "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-brand-700 focus:ring-offset-2";
    if (disabled) return `${base} cursor-not-allowed opacity-60`;
    if (dragOver) return `${base} border-brand-600 bg-brand-50`;
    if (showError) return `${base} border-red-300 bg-red-50/40`;
    return `${base} border-slate-300 bg-white hover:border-brand-600`;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          onClick={openPicker}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openPicker();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          aria-label="Upload your resume PDF"
          className={pickerClass()}
        >
          <span
            className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-2xl"
            aria-hidden="true"
          >
            📄
          </span>
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-700">
              Drag and drop your resume, or{" "}
              <span className="text-brand-700 underline underline-offset-2">
                browse
              </span>
            </p>
            <p className="text-xs text-slate-400">PDF only · Maximum 5 MB</p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="sr-only"
            onChange={(e) => {
              handleFile(e.target.files?.[0]);
              e.target.value = ""; // allow re-selecting the same file
            }}
            disabled={disabled}
          />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-xl"
            aria-hidden="true"
          >
            📎
          </span>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-sm font-medium text-slate-700"
              title={file.name}
            >
              {file.name}
            </p>
            <p className="text-xs text-slate-400">
              {formatFileSize(file.size)}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={clearFile}
              disabled={disabled}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Remove
            </button>
            <button
              type="button"
              onClick={openPicker}
              disabled={disabled}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Change file
            </button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="sr-only"
            onChange={(e) => {
              handleFile(e.target.files?.[0]);
              e.target.value = "";
            }}
            disabled={disabled}
          />
        </div>
      )}
      {showError && (
        <p role="alert" className="text-xs font-medium text-red-600">
          {validationError || requiredError}
        </p>
      )}
    </div>
  );
}
