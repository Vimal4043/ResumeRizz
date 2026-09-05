import axios from "axios";

/**
 * Shared Axios instance. Requests are sent to the relative /api path and, in
 * development, the Vite server proxies them to the Express backend. Override
 * the target with VITE_API_URL if the backend lives elsewhere.
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  headers: { "Content-Type": "application/json" },
});

const TOKEN_KEY = "aijh_token";

export function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function storeToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable (private mode) — session just won't persist */
  }
}

// Attach the JWT to every request (from storage, never from URLs).
api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// A 401 means the token is missing/expired/invalid — drop it so the app
// treats the user as logged out. AuthContext listens for this event.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      storeToken(null);
      window.dispatchEvent(new Event("aijh:unauthenticated"));
    }
    return Promise.reject(error);
  },
);

/**
 * Post a FormData body to the API.
 *
 * We deliberately pass `Content-Type: undefined` so Axios does NOT force its
 * default `application/json` header onto the request. Leaving the header unset
 * lets the browser generate the correct `multipart/form-data; boundary=...`,
 * which keeps the multipart boundary intact for file uploads.
 *
 * @param {string} url - API path (e.g. "/analysis").
 * @param {FormData} formData - The multipart body.
 */
export async function postFormData(url, formData) {
  const { data } = await api.post(url, formData, {
    headers: { "Content-Type": undefined },
  });
  return data;
}

/** Convenience helper used by feature services to read backend errors. */
export function getErrorMessage(error, fallback = "Something went wrong.") {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

/**
 * Structured error for the analysis flow, keyed off the backend's
 * machine-readable `error.code` — never message-text matching.
 *
 * Returns: { code, message, retryAfterSeconds }
 *   - code: the backend error code (or a client-side fallback like NETWORK_ERROR)
 *   - message: the user-facing message (backend-provided when safe, otherwise
 *     a status-based mapping — never raw internals)
 *   - retryAfterSeconds: server-provided retry hint (> 0) for AI_RATE_LIMITED,
 *     or 0 when unknown (no fake countdowns)
 */
export function getAnalysisError(error) {
  const status = error?.response?.status;
  const data = error?.response?.data;
  const backendCode = data?.error?.code;
  const backendMessage = data?.error?.message || data?.message;
  const retryAfterSeconds = Number(data?.error?.retryAfterSeconds) || 0;

  // Network failure / server unreachable — axios has no response object.
  if (!error?.response) {
    return {
      code: "NETWORK_ERROR",
      message:
        "We couldn't connect to the analysis service. Please check your connection and try again.",
      retryAfterSeconds: 0,
    };
  }

  // Prefer the backend's structured error when present.
  if (backendCode) {
    return { code: backendCode, message: backendMessage, retryAfterSeconds };
  }

  // Fallback mapping by HTTP status (older backends / proxies).
  if (status === 429) {
    return {
      code: "AI_RATE_LIMITED",
      message: "AI analysis is temporarily rate-limited. Please try again later.",
      retryAfterSeconds: 0,
    };
  }
  if (status === 408 || status === 504 || error?.code === "ECONNABORTED") {
    return {
      code: "AI_TIMEOUT",
      message: "The analysis took too long to complete. Please try again.",
      retryAfterSeconds: 0,
    };
  }
  if (status === 502 || status === 503) {
    return {
      code: "AI_UNAVAILABLE",
      message: "We couldn't complete the AI analysis right now. Please try again shortly.",
      retryAfterSeconds: 0,
    };
  }
  if (status >= 500) {
    return {
      code: "SERVER_ERROR",
      message: "Something went wrong while analyzing your resume. Please try again.",
      retryAfterSeconds: 0,
    };
  }

  // Client errors (4xx): the backend message is user-facing by contract.
  return {
    code: backendCode || "REQUEST_ERROR",
    message: backendMessage || "Something went wrong. Please try again.",
    retryAfterSeconds: 0,
  };
}

export default api;
