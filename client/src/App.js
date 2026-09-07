import React from "react";
import { BrowserRouter as Router, Navigate, Route, Routes } from "react-router-dom";
import { CssBaseline, ThemeProvider } from "@mui/material";
import theme from "./theme";

import { AuthProvider } from "./context/AuthContext";
import {
  GuestOnly,
  RequireAdmin,
  RequireAuth,
  RequireOnboarding,
} from "./components/RouteGuards";
import AuthPage from "./pages/AuthPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import OnboardingPage from "./pages/OnboardingPage";
import HomePage from "./pages/HomePage";
import AdminPage from "./pages/AdminPage";
import AdminUserPage from "./pages/AdminUserPage";

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <Router>
          <Routes>
            <Route
              path="/"
              element={
                <GuestOnly>
                  <AuthPage />
                </GuestOnly>
              }
            />
            <Route
              path="/forgot-password"
              element={
                <GuestOnly>
                  <ForgotPasswordPage />
                </GuestOnly>
              }
            />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route
              path="/onboarding"
              element={
                <RequireAuth>
                  <OnboardingPage />
                </RequireAuth>
              }
            />
            <Route
              path="/home"
              element={
                <RequireAuth>
                  <RequireOnboarding>
                    <HomePage />
                  </RequireOnboarding>
                </RequireAuth>
              }
            />
            <Route
              path="/admin"
              element={
                <RequireAdmin>
                  <RequireOnboarding>
                    <AdminPage />
                  </RequireOnboarding>
                </RequireAdmin>
              }
            />
            <Route
              path="/admin/users/:id"
              element={
                <RequireAdmin>
                  <RequireOnboarding>
                    <AdminUserPage />
                  </RequireOnboarding>
                </RequireAdmin>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
