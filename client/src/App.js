import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ThemeProvider, CssBaseline } from "@mui/material";
import theme from "./theme";
import { ROUTES } from "./constants/routes";
import LandingPage from "./pages/LandingPage";
import AuthPage from "./pages/AuthPage";

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Routes>
          {/* Public landing page — first screen shown when the app opens */}
          <Route path={ROUTES.HOME} element={<LandingPage />} />
          {/* Existing authentication page (sign-in / sign-up in one component) */}
          <Route path={ROUTES.LOGIN} element={<AuthPage />} />
          {/* Keep the previous catch-all behaviour so refresh / direct links still work */}
          <Route path="*" element={<AuthPage />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;
