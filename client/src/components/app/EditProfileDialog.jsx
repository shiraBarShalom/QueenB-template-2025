import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from "@mui/material";

import { useLanguage } from "../../i18n/LanguageProvider";
import { updateMyProfile } from "../../api/profile";
import { splitTags } from "../../utils/tags";

/**
 * Real profile editing for the mentee Personal Area.
 *
 * Every field maps to a column the backend already persists via
 * PATCH /api/users/me (server/routes/auth.js -> userService.updateUser):
 * fullName, jobTitle, workplace, yearsOfExperience, phoneNumber, linkedinUrl,
 * githubUrl, technologies[], spokenLanguages[]. On success the fresh safe-user
 * is handed back through `onSaved` so AuthContext updates immediately.
 *
 * Note: technologies / spokenLanguages are add-or-keep on the server (MVP —
 * see userService.updateUser), so this dialog does not offer removal of an
 * already-linked tag.
 */
const csv = (list) => (Array.isArray(list) ? list.join(", ") : "");

function initialForm(user) {
  const p = user?.profile || {};
  return {
    fullName: user?.fullName || "",
    jobTitle: p.jobTitle || "",
    workplace: p.workplace || p.company || "",
    yearsOfExperience:
      p.yearsOfExperience === null || p.yearsOfExperience === undefined
        ? ""
        : String(p.yearsOfExperience),
    phoneNumber: p.phoneNumber || "",
    linkedinUrl: p.linkedinUrl || "",
    githubUrl: p.githubUrl || "",
    technologies: csv(user?.technologies),
    spokenLanguages: csv(user?.spokenLanguages),
  };
}

export default function EditProfileDialog({ open, user, onClose, onSaved }) {
  const { t } = useLanguage();
  const c = t.app.personalArea.account;
  const mf = t.app.mentorForm;

  const base = useMemo(() => initialForm(user), [user]);
  const [form, setForm] = useState(base);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  // Re-seed when the dialog (re)opens with a fresh user.
  useEffect(() => {
    if (open) {
      setForm(initialForm(user));
      setError("");
      setFieldErrors({});
      setSaving(false);
    }
  }, [open, user]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const validate = () => {
    const errs = {};
    if (!form.fullName.trim()) errs.fullName = mf.required;
    if (form.yearsOfExperience !== "") {
      const n = Number(form.yearsOfExperience);
      if (!Number.isInteger(n) || n < 0) errs.yearsOfExperience = mf.numberPositive;
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (saving) return;
    if (!validate()) return;
    setSaving(true);
    setError("");

    const payload = {
      fullName: form.fullName.trim(),
      jobTitle: form.jobTitle.trim(),
      workplace: form.workplace.trim(),
      yearsOfExperience:
        form.yearsOfExperience === "" ? null : Number(form.yearsOfExperience),
      phoneNumber: form.phoneNumber.trim(),
      linkedinUrl: form.linkedinUrl.trim(),
      githubUrl: form.githubUrl.trim(),
    };
    const tech = splitTags(form.technologies);
    const spoken = splitTags(form.spokenLanguages);
    if (tech.length) payload.technologies = tech;
    if (spoken.length) payload.spokenLanguages = spoken;

    try {
      const updated = await updateMyProfile(payload);
      onSaved?.(updated);
    } catch (err) {
      setError(err?.response?.data?.message || c.saveError);
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => (saving ? null : onClose())}
      fullWidth
      maxWidth="sm"
      PaperProps={{ sx: { borderRadius: "20px" } }}
    >
      <DialogTitle sx={{ fontWeight: 800, color: "#4a1528" }}>{c.editTitle}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField
            label={c.name}
            value={form.fullName}
            onChange={set("fullName")}
            error={Boolean(fieldErrors.fullName)}
            helperText={fieldErrors.fullName || " "}
            fullWidth
            required
          />
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
            <TextField label={c.jobTitle} value={form.jobTitle} onChange={set("jobTitle")} fullWidth />
            <TextField label={c.workplace} value={form.workplace} onChange={set("workplace")} fullWidth />
            <TextField
              label={c.yearsOfExperience}
              value={form.yearsOfExperience}
              onChange={set("yearsOfExperience")}
              error={Boolean(fieldErrors.yearsOfExperience)}
              helperText={fieldErrors.yearsOfExperience || " "}
              inputProps={{ inputMode: "numeric" }}
              fullWidth
            />
            <TextField label={c.phoneNumber} value={form.phoneNumber} onChange={set("phoneNumber")} fullWidth />
          </Box>
          <TextField label={c.linkedinUrl} value={form.linkedinUrl} onChange={set("linkedinUrl")} fullWidth />
          <TextField label={c.githubUrl} value={form.githubUrl} onChange={set("githubUrl")} fullWidth />
          <TextField
            label={c.technologies}
            value={form.technologies}
            onChange={set("technologies")}
            helperText={c.listHint}
            fullWidth
          />
          <TextField
            label={c.spokenLanguages}
            value={form.spokenLanguages}
            onChange={set("spokenLanguages")}
            helperText={c.listHint}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} disabled={saving} sx={{ color: "#6d3049" }}>
          {c.cancel}
        </Button>
        <Button onClick={handleSave} disabled={saving} variant="contained" sx={{ px: 3 }}>
          {saving ? c.saving : c.save}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
