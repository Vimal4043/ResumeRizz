import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  registerUser,
  loginUser,
  logoutUser,
  fetchCurrentUser,
} from "../services/authService.js";
import { getStoredToken, storeToken } from "../services/api.js";

/**
 * Single source of truth for authentication state. Components never talk to
 * the auth API or read the token directly — they use useAuth().
 */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // 'loading' = we have (or might have) a token and are restoring the session.
  const [initializing, setInitializing] = useState(() =>
    Boolean(getStoredToken()),
  );

  // Restore the session on first mount: verify the stored token server-side.
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      try {
        const me = await fetchCurrentUser();
        if (!cancelled) setUser(me);
      } catch {
        storeToken(null); // interceptor also fires, but be defensive
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setInitializing(false);
      }
    }
    if (getStoredToken()) restore();
    else setInitializing(false);
    return () => {
      cancelled = true;
    };
  }, []);

  // Any API 401 (expired token) should log the user out app-wide.
  useEffect(() => {
    const onUnauthenticated = () => setUser(null);
    window.addEventListener("aijh:unauthenticated", onUnauthenticated);
    return () =>
      window.removeEventListener("aijh:unauthenticated", onUnauthenticated);
  }, []);

  const login = useCallback(async (email, password) => {
    const { token, user: u } = await loginUser({ email, password });
    storeToken(token);
    setUser(u);
    return u;
  }, []);

  const register = useCallback(async (name, email, password) => {
    const { token, user: u } = await registerUser({ name, email, password });
    storeToken(token);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutUser();
    } catch {
      /* token may already be invalid — clearing local state is what matters */
    }
    storeToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, initializing, login, register, logout }),
    [user, initializing, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
