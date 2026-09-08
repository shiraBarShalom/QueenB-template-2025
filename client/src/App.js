import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useParams,
} from "react-router-dom";
import { ThemeProvider, CssBaseline } from "@mui/material";
import theme from "./theme";
import { ROUTES, mentorProfilePath } from "./constants/routes";
import { LanguageProvider } from "./i18n/LanguageProvider";
import { AuthProvider } from "./context/AuthContext";
import { RequireAuth, RequireAdmin, GuestOnly } from "./components/RouteGuards";
import LandingPage from "./pages/LandingPage";
import AuthPage from "./pages/AuthPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import AppLayout from "./components/app/AppLayout";
import MenteeHomePage from "./pages/app/MenteeHomePage";
import MentorProfilePage from "./pages/MentorProfilePage";
import PersonalAreaPage from "./pages/app/PersonalAreaPage";
import MentorAreaPage from "./pages/app/MentorAreaPage";
import ProposeSlotsPage from "./pages/app/ProposeSlotsPage";
import BecomeMentorPage from "./pages/app/BecomeMentorPage";
import MentorProfileEditPage from "./pages/app/MentorProfileEditPage";
import MeetingFeedbackPage from "./pages/app/MeetingFeedbackPage";
import AdminLayout from "./components/admin/AdminLayout";
import AdminPage from "./pages/AdminPage";
import AdminUserPage from "./pages/AdminUserPage";
import AdminMeetingPage from "./pages/AdminMeetingPage";

/** Temporary bridge so old /mentors/:id bookmarks still land on the app shell. */
function LegacyMentorProfileRedirect() {
  const { id } = useParams();
  return <Navigate to={mentorProfilePath(id)} replace />;
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {/* One shared language state for the whole app (public + authenticated) */}
      <LanguageProvider>
        {/*
          Real authentication state (login / sign-up / session). Powers
          pages/AuthPage.jsx via useAuth(). Kept independent of the
          demo-persona hook in auth/useCurrentUser.js that the mentor
          discovery / scheduling / post-meeting screens still run on — see
          context/AuthContext.jsx.
        */}
        <AuthProvider>
          <Router>
            <Routes>
            {/* Public landing page (latest design from main) */}
            <Route path={ROUTES.HOME} element={<LandingPage />} />
            {/* Authentication page (sign-in / sign-up in one component). A
                signed-in visitor is bounced into the app. */}
            <Route
              path={ROUTES.LOGIN}
              element={
                <GuestOnly>
                  <AuthPage />
                </GuestOnly>
              }
            />
            {/* Password recovery (Prisma-backed token; dev logs the link) */}
            <Route
              path="/forgot-password"
              element={
                <GuestOnly>
                  <ForgotPasswordPage />
                </GuestOnly>
              }
            />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* Legacy discovery URLs → authenticated app routes */}
            <Route
              path={ROUTES.LEGACY_MENTORS}
              element={<Navigate to={ROUTES.APP} replace />}
            />
            <Route
              path={ROUTES.LEGACY_MENTOR_PROFILE}
              element={<LegacyMentorProfileRedirect />}
            />

            {/*
              Post-meeting feedback — a focused, standalone page. Deliberately
              NOT nested under <AppLayout>: the user arrives here from a
              notification only to complete feedback, so it renders its own
              minimal shell (logo + card) with no app nav. Declared before the
              /app layout route so the exact path wins. Auth-guarded like the
              rest of the authenticated area.
            */}
            <Route
              path={ROUTES.APP_MEETING_FEEDBACK}
              element={
                <RequireAuth>
                  <MeetingFeedbackPage />
                </RequireAuth>
              }
            />

            {/*
              Admin dashboard (design from main, backed by this branch's
              Prisma models). <RequireAdmin> checks the real session user's
              isAdmin flag; a non-admin is sent to /app.
            */}
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

            {/*
              Authenticated area. <RequireAuth> is the single choke point:
              unauthenticated users are sent to ROUTES.LOGIN, and the nested
              pages mount only once GET /api/users/me has resolved, so the
              identity seam (auth/useCurrentUser -> AuthContext) always has a
              real user id.
            */}
            <Route
              path={ROUTES.APP}
              element={
                <RequireAuth>
                  <AppLayout />
                </RequireAuth>
              }
            >
              {/* TODO(role-redirect): index currently renders the mentee home
                  (mentor discovery) for everyone; later switch by role
                  (mentee → discovery, mentor-only → mentor area). */}
              <Route index element={<MenteeHomePage />} />
              <Route path="mentors/:id" element={<MentorProfilePage />} />
              <Route path="personal-area" element={<PersonalAreaPage />} />
              <Route path="mentor-area" element={<MentorAreaPage />} />
              <Route
                path="mentor-area/requests/:requestId/propose-slots"
                element={<ProposeSlotsPage />}
              />
              <Route path="become-a-mentor" element={<BecomeMentorPage />} />
              <Route path="mentor-profile" element={<MentorProfileEditPage />} />
            </Route>

            {/* Keep the previous catch-all behaviour so refresh / direct links still work */}
            <Route path="*" element={<AuthPage />} />
            </Routes>
          </Router>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;
