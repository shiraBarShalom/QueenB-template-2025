import api from "./client";

const data = (response) => response.data.data;

export const getStats = () => api.get("/admin/stats").then(data);
export const listUsers = (params) => api.get("/admin/users", { params }).then(data);
export const getUser = (id) => api.get(`/admin/users/${id}`).then(data);
export const updateUser = (id, payload) =>
  api.patch(`/admin/users/${id}`, payload).then(data);
export const revokeSessions = (id) =>
  api.delete(`/admin/users/${id}/sessions`).then(data);
export const sendPasswordReset = (id) =>
  api.post(`/admin/users/${id}/password-reset`, {}).then(data);
