import api from "./client";

/**
 * Auth API. Wraps the Prisma-backed auth routes on this branch:
 *   /api/users/{register,login,logout,me,forgot-password,reset-password}
 *
 * `unwrap` returns the { success, data, message } envelope's `data` payload
 * (the safe user). forgot/reset return the whole envelope so callers can show
 * `message`.
 */
const unwrap = (response) => response.data.data;

export const getMe = () => api.get("/users/me").then(unwrap);
export const register = (payload) =>
  api.post("/users/register", payload).then(unwrap);
export const login = (payload) => api.post("/users/login", payload).then(unwrap);
export const logout = () => api.post("/users/logout", {}).then(unwrap);
export const forgotPassword = (email) =>
  api.post("/users/forgot-password", { email }).then((response) => response.data);
export const resetPassword = (token, password) =>
  api
    .post("/users/reset-password", { token, password })
    .then((response) => response.data);
