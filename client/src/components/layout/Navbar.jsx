import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import Button from "../common/Button.jsx";

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
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
        <Link
          to={user ? "/dashboard" : "/"}
          className="flex items-center gap-2 text-lg font-bold text-brand-700"
        >
          <span aria-hidden="true">📄</span> ResumeRizz
        </Link>
        <nav className="flex items-center gap-4">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `text-sm font-medium transition-colors ${
                  isActive
                    ? "text-brand-700"
                    : "text-slate-600 hover:text-slate-900"
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
          {user ? (
            <div className="flex items-center gap-3">
              <span
                className="max-w-40 truncate text-sm text-slate-500"
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
              <Link to="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900">
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
