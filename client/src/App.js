import React from "react";
import { BrowserRouter as Router, Routes, Route, Outlet } from "react-router-dom";
import { ThemeProvider, CssBaseline } from "@mui/material";
import theme from "./theme";
import Layout from "./components/shared/Layout";
import AuthPage from "./components/AuthPage";
import Dashboard from "./components/Dashboard";
import ProfilePage from "./pages/ProfilePage";
import MentorsPage from "./pages/MentorsPage";
import SchedulingPage from "./pages/SchedulingPage";

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Routes>
          {/* Auth stands alone — no navbar until the visitor is in. */}
          <Route path="/login" element={<AuthPage />} />

          <Route
            element={
              <Layout>
                <Outlet />
              </Layout>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/mentors" element={<MentorsPage />} />
            <Route path="/scheduling/:requestId" element={<SchedulingPage />} />
          </Route>
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;
