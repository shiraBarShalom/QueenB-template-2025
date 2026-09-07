import React, { useState } from "react";
import { Alert, Button, Chip, Stack, Typography } from "@mui/material";
import { Link } from "react-router-dom";
import PageShell from "../components/PageShell";
import { useAuth } from "../context/AuthContext";

export default function HomePage() {
  const { user, signOut } = useAuth();
  const [error, setError] = useState("");
  const profile = user.profile || {};

  const logout = async () => {
    try {
      await signOut();
    } catch {
      setError("Could not sign out.");
    }
  };

  return (
    <PageShell title={`Welcome, ${user.displayName}`} subtitle="Your MentorMe profile is ready.">
      <Stack spacing={2}>
        {error && <Alert severity="error">{error}</Alert>}
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {(user.roles || []).map((role) => (
            <Chip key={role} label={role === "MENTOR" ? "Mentor" : "Mentee"} color="primary" />
          ))}
          {user.isAdmin && <Chip label="Admin" color="secondary" />}
        </Stack>
        <Typography>{profile.background || "Add an introduction so people can get to know you."}</Typography>
        {(profile.jobTitle || profile.company) && (
          <Typography color="text.secondary">
            {[profile.jobTitle, profile.company].filter(Boolean).join(" at ")}
          </Typography>
        )}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          <Button component={Link} to="/onboarding" variant="contained">
            Edit profile
          </Button>
          {user.isAdmin && (
            <Button component={Link} to="/admin" variant="outlined">
              Admin dashboard
            </Button>
          )}
          <Button onClick={logout} color="inherit">
            Sign out
          </Button>
        </Stack>
      </Stack>
    </PageShell>
  );
}
