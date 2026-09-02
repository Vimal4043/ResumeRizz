/** Labeled input used across auth and settings forms. */
export default function Input({ label, id, className = "", ...props }) {
  const inputId = id ?? props.name ?? label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        {...props}
      />
    </div>
  );
}
