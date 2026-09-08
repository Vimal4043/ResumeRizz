import { useEffect, useState } from "react";
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

/* Lucide "menu" (hamburger) icon — opens the mobile menu. */
function MenuIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="4" x2="20" y1="6" y2="6" />
      <line x1="4" x2="20" y1="12" y2="12" />
      <line x1="4" x2="20" y1="18" y2="18" />
    </svg>
  );
}

/* Lucide "x" icon — closes the mobile menu. */
function CloseIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
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
 *
 * Responsive: on desktop (≥ md) links + auth render inline in the bar. On
 * mobile the logo and theme toggle stay visible, while navigation and auth
 * actions collapse into an accessible dropdown opened by a hamburger button.
 */
export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinks = [
    { to: "/analyze", label: "Analyze Resume" },
    ...(user ? [{ to: "/dashboard", label: "Dashboard" }] : []),
  ];

  // Close the menu whenever a navigation link is tapped.
  function handleNavClick() {
    setMenuOpen(false);
  }

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
    setMenuOpen(false);
  }

  // Close the menu whenever the route changes. Link taps are handled
  // directly by handleNavClick; this listener additionally covers browser
  // back/forward (popstate) so the menu is never stranded on the wrong page.
  useEffect(() => {
    function closeOnPopState() {
      setMenuOpen(false);
    }
    window.addEventListener("popstate", closeOnPopState);
    return () => window.removeEventListener("popstate", closeOnPopState);
  }, []);

  // Close the menu on Escape regardless of how it was opened.
  useEffect(() => {
    if (!menuOpen) return undefined;
    function onKeyUp(e) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keyup", onKeyUp);
    return () => document.removeEventListener("keyup", onKeyUp);
  }, [menuOpen]);

  // Lock page scroll while the mobile overlay is open so the content behind
  // it does not move. Restored on cleanup so the original value is preserved.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-surface">
      <div className="relative z-10 mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-4">
        <Link
          to={user ? "/dashboard" : "/"}
          onClick={handleNavClick}
          className="flex min-w-0 items-center"
        >
          <img
            src="/logoWithName.png"
            alt="ResumeRizz"
            className="h-14 w-auto"
          />
        </Link>

        {/* Desktop navigation */}
        <nav
          className="hidden items-center gap-4 md:flex"
          aria-label="Main navigation"
        >
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
              <Link
                to="/login"
                className="text-sm font-medium text-text-secondary hover:text-text-primary"
              >
                Log in
              </Link>
              <Link to="/register">
                <Button>Sign up</Button>
              </Link>
            </>
          )}
        </nav>

        {/* Mobile: theme toggle stays accessible; hamburger opens the menu. */}
        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={
              menuOpen ? "Close navigation menu" : "Open navigation menu"
            }
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-primary-soft hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {/* Mobile drawer - a compact right-side navigation panel that drops down
          from directly beneath the hamburger. A dimmed, blurred backdrop covers
          the page content below the navbar bar and dismisses the drawer on
          outside clicks; clicks inside the drawer are captured so interacting
          without choosing a link does not close it. Page scroll is locked while
          open (see the effect below). The panel is content-sized (never full
          height), ~min(85vw, 340px) wide, and slides in from the right. */}
      {menuOpen && (
        <>
          {/* Dimmed, blurred backdrop covering the page content BELOW the navbar
              bar, so the bar itself (hamburger/X, theme toggle) stays visible and
              interactive and the panel reads as dropping from under it. Clicking
              the backdrop dismisses the drawer. */}
          <div
            className="fixed left-0 right-0 bottom-0 top-16 z-20 bg-black/40 backdrop-blur-sm md:hidden"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <nav
            id="mobile-nav"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile navigation menu"
            className="fixed top-16 right-0 z-30 flex max-h-[calc(100dvh-4rem)] w-[min(85vw,340px)] flex-col overflow-y-auto rounded-bl-2xl border-l border-b border-border bg-surface shadow-xl rr-slide-in-right md:hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <ul className="space-y-0.5 p-2">
              {navLinks.map((link) => (
                <li key={link.to}>
                  <NavLink
                    to={link.to}
                    onClick={handleNavClick}
                    className={({ isActive }) =>
                      `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-primary-soft text-primary"
                          : "text-text-secondary hover:bg-surface-elevated"
                      }`
                    }
                  >
                    {link.label}
                  </NavLink>
                </li>
              ))}
            </ul>

            {user ? (
              <div className="space-y-2 border-t border-border px-3 py-2.5">
                <p
                  className="truncate px-1 text-xs text-text-muted"
                  title={user.email}
                >
                  {user.name}
                </p>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={handleLogout}
                >
                  Log out
                </Button>
              </div>
            ) : (
              <div className="space-y-2 border-t border-border px-3 py-2.5">
                <Link
                  to="/login"
                  onClick={handleNavClick}
                  className="block w-full rounded-md border border-border px-4 py-2 text-center text-sm font-medium text-text-secondary transition-colors hover:bg-surface-elevated"
                >
                  Log in
                </Link>
                <Link to="/register" onClick={handleNavClick}>
                  <Button className="w-full">Sign up</Button>
                </Link>
              </div>
            )}
          </nav>
        </>
      )}
    </header>
  );
}
