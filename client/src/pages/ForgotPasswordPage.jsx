import React, { useState } from "react";
import { Alert, Button, Stack, TextField } from "@mui/material";
import { Link } from "react-router-dom";
import PageShell from "../components/PageShell";
import { useLanguage } from "../i18n/LanguageProvider";
import { forgotPassword } from "../api/auth";

export default function ForgotPasswordPage() {
  const { t } = useLanguage();
  const copy = t.forgot;
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
      setError(requestError.response?.data?.message || copy.error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell title={copy.title} subtitle={copy.subtitle} maxWidth={480} showLanguage>
      <Stack component="form" onSubmit={submit} spacing={2}>
        {message && <Alert severity="success">{message}</Alert>}
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          required
          type="email"
          label={copy.email}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
        />
        <Button type="submit" variant="contained" disabled={submitting}>
          {submitting ? copy.sending : copy.send}
        </Button>
        <Button component={Link} to="/login" variant="text">
          {copy.back}
        </Button>
      </Stack>
    </PageShell>
  );
}
