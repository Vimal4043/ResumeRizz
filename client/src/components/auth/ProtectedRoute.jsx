import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import Spinner from "../common/Spinner.jsx";

/**
 * Route guard: renders child routes only for authenticated users.
 * While the session is being restored, shows a spinner instead of flashing
 * the login page. Unauthenticated users are redirected to /login, remembering
 * where they wanted to go.
 */
export default function ProtectedRoute() {
  const { user, initializing } = useAuth();
  const location = useLocation();

  if (initializing) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
