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
import LandingPage from "./pages/LandingPage";
import AuthPage from "./pages/AuthPage";
import MentorsPage from "./pages/MentorsPage";
import MentorProfilePage from "./pages/MentorProfilePage";
import AppLayout from "./components/app/AppLayout";
import PersonalAreaPage from "./pages/app/PersonalAreaPage";
import MentorAreaPage from "./pages/app/MentorAreaPage";
import BecomeMentorPage from "./pages/app/BecomeMentorPage";

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
        <Router>
          <Routes>
            {/* Public landing page — first screen shown when the app opens */}
            <Route path={ROUTES.HOME} element={<LandingPage />} />
            {/* Existing authentication page (sign-in / sign-up in one component) */}
            <Route path={ROUTES.LOGIN} element={<AuthPage />} />

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
              Authenticated area.
              FUTURE: wrap this <Route> element with <RequireAuth> once real
              auth exists — single choke point, no page changes needed.
            */}
            <Route path={ROUTES.APP} element={<AppLayout />}>
              {/* TODO(role-redirect): index currently renders mentor discovery for
                  everyone; later switch by role (mentee → search,
                  mentor-only → mentor area). */}
              <Route index element={<MentorsPage />} />
              <Route path="mentors/:id" element={<MentorProfilePage />} />
              <Route path="personal-area" element={<PersonalAreaPage />} />
              <Route path="mentor-area" element={<MentorAreaPage />} />
              <Route path="become-a-mentor" element={<BecomeMentorPage />} />
            </Route>

            {/* Keep the previous catch-all behaviour so refresh / direct links still work */}
            <Route path="*" element={<AuthPage />} />
          </Routes>
        </Router>
      </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;
