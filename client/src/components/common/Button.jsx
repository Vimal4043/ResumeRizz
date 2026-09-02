import Spinner from "./Spinner.jsx";

export default function Button({
  children,
  variant = "primary",
  type = "button",
  loading = false,
  className = "",
  disabled,
  ...props
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50";

  const variants = {
    primary: "bg-primary text-white hover:bg-primary-hover focus:ring-primary",
    secondary:
      "border border-border bg-surface text-text-secondary hover:bg-surface-elevated focus:ring-primary",
    danger: "bg-danger text-white hover:bg-danger focus:ring-danger",
    ghost: "text-text-secondary hover:bg-surface-elevated focus:ring-primary",
  };

  return (
    <button
      type={type}
      className={`${base} ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}
