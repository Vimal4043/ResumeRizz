import api from "./api.js";

/**
 * Authentication API calls. All endpoints return the `{ success, message, data }`
 * envelope; helpers unwrap `data`.
 */

export async function registerUser({ name, email, password }) {
  const { data } = await api.post("/auth/register", { name, email, password });
  return data.data; // { token, user }
}

export async function loginUser({ email, password }) {
  const { data } = await api.post("/auth/login", { email, password });
  return data.data; // { token, user }
}

export async function logoutUser() {
  await api.post("/auth/logout");
}

export async function fetchCurrentUser() {
  const { data } = await api.get("/auth/me");
  return data.data.user;
}
