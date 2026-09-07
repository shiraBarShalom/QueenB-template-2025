import api from "./client";

const data = (response) => response.data.data;

export const getMe = () => api.get("/users/me").then(data);
export const register = (payload) => api.post("/users/register", payload).then(data);
export const login = (payload) => api.post("/users/login", payload).then(data);
export const logout = () => api.post("/users/logout", {}).then(data);
export const forgotPassword = (email) =>
  api.post("/users/forgot-password", { email }).then((response) => response.data);
export const resetPassword = (token, password) =>
  api.post("/users/reset-password", { token, password }).then((response) => response.data);
export const updateAccount = (payload) =>
  api.patch("/users/me", payload).then(data);
export const updateProfile = (payload) =>
  api.patch("/users/me/profile", payload).then(data);
export const updateMentorProfile = (payload) =>
  api.patch("/users/me/mentor-profile", payload).then(data);
export const updateRoles = (roles) =>
  api.put("/users/me/roles", { roles }).then(data);
