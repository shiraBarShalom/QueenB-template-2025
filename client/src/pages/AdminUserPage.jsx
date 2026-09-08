import React, { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Paper,
  Typography,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  Stack,
  TextField,
} from "@mui/material";
import { Link, useNavigate, useParams } from "react-router-dom";
import PageShell from "../components/PageShell";
import { useAuth } from "../context/AuthContext";
import { getUser, revokeSessions, sendPasswordReset, updateUser } from "../api/admin";

const emptyForm = {
  displayName: "",
  email: "",
  isAdmin: false,
  isActive: true,
  mentee: true,
  mentor: false,
  background: "",
  jobTitle: "",
  company: "",
  yearsOfExperience: "",
  onboardingComplete: false,
};

export default function AdminUserPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: actor, refreshUser } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [stats, setStats] = useState({ meetingsAsMentor: 0, meetingsAsMentee: 0, createdAt: null });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const handleAdminError = (requestError, fallback) => {
    if (requestError.response?.status === 401) {
      navigate("/login", { replace: true });
      return;
    }
    if (requestError.response?.status === 403) {
      navigate("/app", { replace: true });
      return;
    }
    setError(requestError.response?.data?.message || fallback);
  };

  useEffect(() => {
    getUser(id)
      .then((user) => {
        setForm({
          displayName: user.displayName || "",
          email: user.email || "",
          isAdmin: Boolean(user.isAdmin),
          isActive: user.isActive !== false,
          mentee: (user.roles || []).includes("MENTEE"),
          mentor: (user.roles || []).includes("MENTOR"),
          background: user.profile?.background || "",
          jobTitle: user.profile?.jobTitle || "",
          company: user.profile?.company || "",
          yearsOfExperience: user.profile?.yearsOfExperience ?? "",
          onboardingComplete: Boolean(user.profile?.onboardingComplete),
        });
        setStats({
          meetingsAsMentor: user.meetingsAsMentor || 0,
          meetingsAsMentee: user.meetingsAsMentee || 0,
          createdAt: user.createdAt || null,
        });
        setError("");
      })
      .catch((requestError) => handleAdminError(requestError, "Could not load this account."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, navigate]);

  const change = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const save = async () => {
    const roles = [
      form.mentee ? "MENTEE" : null,
      form.mentor ? "MENTOR" : null,
    ].filter(Boolean);
    if (roles.length === 0) {
      setError("Choose at least one mentoring goal.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await updateUser(id, {
        displayName: form.displayName.trim(),
        email: form.email.trim(),
        isAdmin: form.isAdmin,
        isActive: form.isActive,
        roles,
        profile: {
          background: form.background || null,
          jobTitle: form.jobTitle || null,
          company: form.company || null,
          yearsOfExperience:
            form.yearsOfExperience === "" ? null : Number(form.yearsOfExperience),
          onboardingComplete: form.onboardingComplete,
        },
      });
      if (String(actor.id) === String(id)) await refreshUser();
      setMessage("Account updated.");
    } catch (requestError) {
      handleAdminError(requestError, "Could not update this account.");
    } finally {
      setSaving(false);
    }
  };

  const runConfirmed = async () => {
    const action = confirm;
    setConfirm(null);
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (action === "reset") {
        await sendPasswordReset(id);
        setMessage("A password reset email was requested.");
      }
      if (action === "sessions") {
        const result = await revokeSessions(id);
        setMessage(`Revoked ${result.revokedSessions} session(s).`);
        if (String(actor.id) === String(id)) navigate("/login", { replace: true });
      }
    } catch (requestError) {
      handleAdminError(requestError, "Could not complete that administrator action.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell title="Manage account" subtitle="Changes are audited and take effect immediately." maxWidth={720}>
      <Stack spacing={2}>
        {error && <Alert severity="error">{error}</Alert>}
        {message && <Alert severity="success">{message}</Alert>}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          <Paper sx={{ p: 2, flex: 1 }}>
            <Typography variant="h4">{stats.meetingsAsMentor}</Typography>
            <Typography color="text.secondary">Meetings as mentor</Typography>
          </Paper>
          <Paper sx={{ p: 2, flex: 1 }}>
            <Typography variant="h4">{stats.meetingsAsMentee}</Typography>
            <Typography color="text.secondary">Meetings as mentee</Typography>
          </Paper>
        </Stack>
        {stats.createdAt && (
          <Typography color="text.secondary">
            Registered {new Date(stats.createdAt).toLocaleDateString("en-US")}
          </Typography>
        )}
        <TextField label="Display name" value={form.displayName} onChange={change("displayName")} />
        <TextField label="Email" type="email" value={form.email} onChange={change("email")} />
        <TextField
          label="Background"
          multiline
          minRows={3}
          value={form.background}
          onChange={change("background")}
        />
        <TextField label="Job title" value={form.jobTitle} onChange={change("jobTitle")} />
        <TextField label="Company" value={form.company} onChange={change("company")} />
        <TextField
          label="Years of experience"
          type="number"
          inputProps={{ min: 0, max: 80 }}
          value={form.yearsOfExperience}
          onChange={change("yearsOfExperience")}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={form.mentee}
              onChange={(event) => setForm((current) => ({ ...current, mentee: event.target.checked }))}
            />
          }
          label="Mentee"
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={form.mentor}
              onChange={(event) => setForm((current) => ({ ...current, mentor: event.target.checked }))}
            />
          }
          label="Mentor"
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={form.isAdmin}
              onChange={(event) => setForm((current) => ({ ...current, isAdmin: event.target.checked }))}
            />
          }
          label="Administrator"
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={form.isActive}
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
            />
          }
          label="Account is active"
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={form.onboardingComplete}
              onChange={(event) =>
                setForm((current) => ({ ...current, onboardingComplete: event.target.checked }))
              }
            />
          }
          label="Onboarding complete"
        />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          <Button variant="contained" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
          <Button onClick={() => setConfirm("reset")} disabled={saving}>
            Send reset email
          </Button>
          <Button onClick={() => setConfirm("sessions")} disabled={saving}>
            Sign out everywhere
          </Button>
          <Button component={Link} to="/admin" color="inherit">
            Back to list
          </Button>
        </Stack>
      </Stack>
      <Dialog open={Boolean(confirm)} onClose={() => setConfirm(null)}>
        <DialogTitle>
          {confirm === "reset" ? "Send a password reset email?" : "Sign this person out everywhere?"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirm === "reset"
              ? "They will receive a one-time reset link if the account is active."
              : "Every existing session for this account will be revoked immediately."}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Cancel</Button>
          <Button variant="contained" onClick={runConfirmed}>
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </PageShell>
  );
}
