import React, { useState } from "react";
import { Alert, Button, Stack, TextField } from "@mui/material";
import { Link } from "react-router-dom";
import PageShell from "../components/PageShell";
import { forgotPassword } from "../api/users";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await forgotPassword(email.trim());
      setMessage(response.message);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not request a reset email.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell title="Reset your password" subtitle="We’ll email you a secure, one-time reset link." maxWidth={480}>
      <Stack component="form" onSubmit={submit} spacing={2}>
        {message && <Alert severity="success">{message}</Alert>}
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          required
          type="email"
          label="Account email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
        />
        <Button type="submit" variant="contained" disabled={submitting}>
          {submitting ? "Sending…" : "Send reset link"}
        </Button>
        <Button component={Link} to="/" variant="text">Back to sign in</Button>
      </Stack>
    </PageShell>
  );
}
