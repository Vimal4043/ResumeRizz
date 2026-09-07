export default function EmptyState({
  title,
  description,
  icon = "📄",
  action,
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface px-4 py-8 text-center sm:px-6 sm:py-12">
      <div className="mb-3 text-4xl">{icon}</div>
      <h3 className="text-base font-semibold text-text-primary">{title}</h3>
      {description && (
        <p className="mt-1 max-w-md text-sm text-text-muted">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
