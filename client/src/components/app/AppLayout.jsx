import React from "react";
import { Outlet } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import { Box, Container } from "@mui/material";
import { useLanguage } from "../../i18n/LanguageProvider";
import AppNav from "./AppNav";
import { NAV_HEIGHT } from "../common/NavShell";

/**
 * Layout route for the whole authenticated area ("/app/...").
 *
 * Why a layout route (vs. each page importing its own frame):
 *   - one place mounts the navbar + page frame + <Outlet/>;
 *   - adding a page is one <Route> line, no layout wiring to forget;
 *   - it is the single choke point where the future auth guard and the
 *     role-based post-login redirect will live.
 *
 * Direction / typography: this subtree applies the shared LanguageProvider
 * theme + `dir` + the --mq-font-* CSS variables, exactly like the landing
 * page. The base app <ThemeProvider> in App.js is left untouched so
 * AuthPage stays LTR/English.
 *
 * ────────────────────────────────────────────────────────────────
 * FUTURE INTEGRATION POINT — auth guard:
 * When real auth exists, wrap the returned tree (or this element in
 * App.js) with a <RequireAuth> that redirects unauthenticated users to
 * ROUTES.LOGIN. Nothing else here needs to change.
 * ────────────────────────────────────────────────────────────────
 */
export default function AppLayout() {
  const { dir, fonts, theme } = useLanguage();

  return (
    <ThemeProvider theme={theme}>
      <Box
        dir={dir}
        sx={{
          "--mq-font-body": fonts.body,
          "--mq-font-display": fonts.display,
          direction: dir,
          fontFamily: "var(--mq-font-body)",
          minHeight: "100vh",
          color: "#4a1528",
          backgroundColor: "#fff7fa",
        }}
      >
        <AppNav />
        <Box component="main" sx={{ py: { xs: 3, md: 5 }, minHeight: `calc(100vh - ${NAV_HEIGHT}px)` }}>
          <Container maxWidth="lg">
            <Outlet />
          </Container>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
