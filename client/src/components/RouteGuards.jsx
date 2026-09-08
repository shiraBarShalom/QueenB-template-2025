import React from "react";
import { Box, CircularProgress } from "@mui/material";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ROUTES } from "../constants/routes";

/**
 * Route guards ported from feature/mentorme-login-page and adapted to this
 * branch's route table (login lives at ROUTES.LOGIN = "/login"; the
 * authenticated area is ROUTES.APP = "/app"). `RequireOnboarding` from the
 * incoming branch is restored here: after sign-up the user fills /onboarding
 * before entering /app. Existing complete profiles still go straight to /app.
 *
 * <RequireAuth> wraps the ROUTES.APP subtree and the standalone
 * ROUTES.APP_MEETING_FEEDBACK route in App.js; <RequireAdmin> wraps /admin
 * (checked against the real session user's isAdmin). The guarded pages read
 * identity from auth/useCurrentUser -> AuthContext / useAuth(), so they must
 * not mount until GET /api/users/me has resolved a real user. <GuestOnly>
 * guards /login and sends the user to onboarding, /app, or /admin.
 */

export function postAuthPath(user) {
  if (!user) return ROUTES.LOGIN;
  if (user.isAdmin) return "/admin";
  const onboarded = Boolean(user.profile?.onboardingComplete || user.onboardingComplete);
  return onboarded ? ROUTES.APP : ROUTES.ONBOARDING;
}

function LoadingScreen() {
  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <CircularProgress aria-label="Checking your session" />
    </Box>
  );
}

export function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (!user) {
    return <Navigate to={ROUTES.LOGIN} replace state={{ from: location }} />;
  }
  return children;
}

export function RequireOnboarding({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to={ROUTES.LOGIN} replace />;
  if (user.isAdmin) return children;
  const onboarded = Boolean(user.profile?.onboardingComplete || user.onboardingComplete);
  if (!onboarded) return <Navigate to={ROUTES.ONBOARDING} replace />;
  return children;
}

export function GuestOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return children;
  return <Navigate to={postAuthPath(user)} replace />;
}

// Admin area. Not signed in -> /login; signed in but not an admin -> /app.
// isAdmin comes from GET /api/users/me (the DB flag), never hardcoded.
export function RequireAdmin({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (!user) {
    return <Navigate to={ROUTES.LOGIN} replace state={{ from: location }} />;
  }
  if (!user.isAdmin) return <Navigate to={ROUTES.APP} replace />;
  return children;
}
