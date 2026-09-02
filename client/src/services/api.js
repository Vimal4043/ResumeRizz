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
  return error?.response?.data?.message || error?.message || fallback;
}

export default api;
