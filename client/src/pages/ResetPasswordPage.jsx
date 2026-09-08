import React, { useState } from "react";
import { Alert, Button, Stack, TextField } from "@mui/material";
import { Link, useSearchParams } from "react-router-dom";
import PageShell from "../components/PageShell";
import { useLanguage } from "../i18n/LanguageProvider";
import { resetPassword } from "../api/auth";

export default function ResetPasswordPage() {
  const { t } = useLanguage();
  const copy = t.reset;
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (password.length < 12) return setError(copy.short);
    if (password !== confirmPassword) return setError(copy.mismatch);
    setSubmitting(true);
    setError("");
    try {
      const response = await resetPassword(token, password);
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
        {!token && <Alert severity="error">{copy.missingToken}</Alert>}
        {message && <Alert severity="success">{message}</Alert>}
        {error && <Alert severity="error">{error}</Alert>}
        {!message && (
          <>
            <TextField
              required
              type="password"
              label={copy.password}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <TextField
              required
              type="password"
              label={copy.confirm}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
            <Button type="submit" variant="contained" disabled={submitting || !token}>
              {submitting ? copy.resetting : copy.submit}
            </Button>
          </>
        )}
        <Button component={Link} to="/login" variant="text">
          {copy.back}
        </Button>
      </Stack>
    </PageShell>
  );
}
