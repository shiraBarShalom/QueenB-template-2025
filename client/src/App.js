import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ThemeProvider, CssBaseline } from "@mui/material";
import theme from "./theme";
import Layout from "./components/shared/Layout";
import Dashboard from "./components/Dashboard";
import ProfilePage from "./pages/ProfilePage";
import MentorsPage from "./pages/MentorsPage";
import SchedulingPage from "./pages/SchedulingPage";

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/mentors" element={<MentorsPage />} />
            <Route path="/scheduling/:requestId" element={<SchedulingPage />} />
          </Routes>
        </Layout>
      </Router>
    </ThemeProvider>
  );
}

export default App;
