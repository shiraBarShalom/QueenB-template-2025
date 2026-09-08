import api from "./client";

const data = (response) => response.data.data;

export const updateAccount = (payload) => api.patch("/users/me", payload).then(data);
export const updateProfile = (payload) =>
  api.patch("/users/me/profile", payload).then(data);
export const updateMentorProfile = (payload) =>
  api.patch("/users/me/mentor-profile", payload).then(data);
export const updateRoles = (roles) =>
  api.put("/users/me/roles", { roles }).then(data);
export const submitMentorApplication = (payload) =>
  api.post("/users/me/mentor-application", payload).then(data);
