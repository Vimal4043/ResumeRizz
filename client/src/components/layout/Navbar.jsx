import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useTheme } from "../../context/ThemeContext.jsx";
import Button from "../common/Button.jsx";

/* Lucide "sun" icon (inline to avoid an extra dependency). */
function SunIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

/* Lucide "moon" icon (inline to avoid an extra dependency). */
function MoonIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

/**
 * Compact, accessible light/dark toggle for the navbar. Shows a Sun icon when
 * dark mode is active (click to go light) and a Moon icon when light mode is
 * active (click to go dark) — the icon plus the label communicate state, not
 * color alone. Theme state comes from ThemeContext; persistence lives there.
 */
function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={!isDark}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-primary-soft hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

/**
 * Auth-aware navigation. Analysis is public for everyone: guests see
 * "Analyze Resume · Log in · Sign up"; signed-in users see "Analyze Resume ·
 * Dashboard · name · Log out". All auth behavior comes from useAuth() — no
 * component duplicates token/session logic.
 */
export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const navLinks = [
    { to: "/analyze", label: "Analyze Resume" },
    ...(user ? [{ to: "/dashboard", label: "Dashboard" }] : []),
  ];

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
        <Link
          to={user ? "/dashboard" : "/"}
          className="flex items-center gap-2 text-lg font-bold text-primary"
        >
          <span aria-hidden="true">📄</span> ResumeRizz
        </Link>
        <nav className="flex items-center gap-4">
          <ThemeToggle />
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `text-sm font-medium transition-colors ${
                  isActive
                    ? "text-primary"
                    : "text-text-secondary hover:text-text-primary"
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
          {user ? (
            <div className="flex items-center gap-3">
              <span
                className="max-w-40 truncate text-sm text-text-muted"
                title={user.email}
              >
                {user.name}
              </span>
              <Button variant="secondary" onClick={handleLogout}>
                Log out
              </Button>
            </div>
          ) : (
            <>
              <Link to="/login" className="text-sm font-medium text-text-secondary hover:text-text-primary">
                Log in
              </Link>
              <Link to="/register">
                <Button>Sign up</Button>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
