import React, { useState } from "react";
import { Alert, Button, Stack, TextField } from "@mui/material";
import { Link, useSearchParams } from "react-router-dom";
import PageShell from "../components/PageShell";
import { resetPassword } from "../api/auth";

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (password.length < 12) return setError("Use at least 12 characters.");
    if (password !== confirmPassword) return setError("Passwords do not match.");
    setSubmitting(true);
    setError("");
    try {
      const response = await resetPassword(token, password);
      setMessage(response.message);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not reset your password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell title="Choose a new password" subtitle="The reset link can be used only once." maxWidth={480}>
      <Stack component="form" onSubmit={submit} spacing={2}>
        {!token && <Alert severity="error">This reset link is missing its token.</Alert>}
        {message && <Alert severity="success">{message}</Alert>}
        {error && <Alert severity="error">{error}</Alert>}
        {!message && (
          <>
            <TextField required type="password" label="New password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            <TextField required type="password" label="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
            <Button type="submit" variant="contained" disabled={submitting || !token}>
              {submitting ? "Resetting…" : "Reset password"}
            </Button>
          </>
        )}
        <Button component={Link} to="/" variant="text">Go to sign in</Button>
      </Stack>
    </PageShell>
  );
}
