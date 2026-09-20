export default function PageContainer({ title, subtitle, children, actions, align = "left" }) {
  const centered = align === "center";
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div
        className={
          centered
            ? "mb-6 flex flex-col items-center gap-3 text-center"
            : "mb-6 flex gap-3 items-center justify-between"
        }
      >
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-text-primary">{title}</h1>
          {subtitle && (
            <p className="mt-1 text-sm text-text-muted">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className={centered ? "shrink-0" : "shrink-0 self-auto"}>{actions}</div>
        )}
      </div>
      {children}
    </div>
  );
}
