import React from "react";
import { BrowserRouter as Router, Navigate, Route, Routes } from "react-router-dom";
import { CssBaseline, ThemeProvider } from "@mui/material";
import theme from "./theme";
import { ROUTES } from "./constants/routes";
import { LanguageProvider } from "./i18n/LanguageProvider";
import { AuthProvider } from "./context/AuthContext";
import {
  GuestOnly,
  RequireAdmin,
  RequireAuth,
  RequireOnboarding,
} from "./components/RouteGuards";
import LandingPage from "./pages/LandingPage";
import AuthPage from "./pages/AuthPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import OnboardingPage from "./pages/OnboardingPage";
import HomePage from "./pages/HomePage";
import AdminPage from "./pages/AdminPage";
import AdminUserPage from "./pages/AdminUserPage";
import AdminMeetingPage from "./pages/AdminMeetingPage";
import AdminLayout from "./components/admin/AdminLayout";
import AppLayout from "./components/app/AppLayout";
import MenteeHomePage from "./pages/app/MenteeHomePage";
import PersonalAreaPage from "./pages/app/PersonalAreaPage";
import MentorAreaPage from "./pages/app/MentorAreaPage";
import BecomeMentorPage from "./pages/app/BecomeMentorPage";

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <LanguageProvider>
        <AuthProvider>
          <Router>
            <Routes>
              <Route path={ROUTES.HOME} element={<LandingPage />} />
              <Route
                path={ROUTES.LOGIN}
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
                    <AdminLayout />
                  </RequireAdmin>
                }
              >
                <Route index element={<AdminPage />} />
                <Route path="users/:id" element={<AdminUserPage />} />
                <Route path="meetings/:id" element={<AdminMeetingPage />} />
              </Route>
              <Route
                path={ROUTES.APP}
                element={
                  <RequireAuth>
                    <AppLayout />
                  </RequireAuth>
                }
              >
                <Route index element={<MenteeHomePage />} />
                <Route path="personal-area" element={<PersonalAreaPage />} />
                <Route path="mentor-area" element={<MentorAreaPage />} />
                <Route path="become-a-mentor" element={<BecomeMentorPage />} />
              </Route>
              <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
            </Routes>
          </Router>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;
