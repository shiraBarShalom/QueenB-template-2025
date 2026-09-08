import React, { useState } from "react";
import { Alert, Box, Button, Stack, TextField, Typography } from "@mui/material";

import { useLanguage } from "../../../i18n/LanguageProvider";
import { splitTags } from "../../../utils/tags";

/**
 * Shared mentor-details form — used by both "Become a mentor" (create) and the
 * "Edit mentor profile" page. Every field maps to something the project already
 * stores and shows in mentor discovery:
 *
 *   MentorProfile : background, meetingCapacity, meetingDurationMinutes,
 *                   mentoringTopics[]
 *   User          : jobTitle, workplace, yearsOfExperience, linkedinUrl,
 *                   githubUrl, technologies[], spokenLanguages[]
 *
 * `onSubmit(payload)` receives a flat object with those keys (numbers coerced,
 * empty list fields omitted). Comma-separated list fields are split into
 * INDIVIDUAL, de-duped values via splitTags so each is stored one-per-row.
 * The parent owns the API call + success state.
 */
const csv = (list) => (Array.isArray(list) ? list.join(", ") : list || "");

export function toFormValues(initial = {}) {
  return {
    background: initial.background || "",
    jobTitle: initial.jobTitle || "",
    workplace: initial.workplace || initial.company || "",
    yearsOfExperience:
      initial.yearsOfExperience === null || initial.yearsOfExperience === undefined
        ? ""
        : String(initial.yearsOfExperience),
    linkedinUrl: initial.linkedinUrl || "",
    githubUrl: initial.githubUrl || "",
    technologies: csv(initial.technologies),
    spokenLanguages: csv(initial.spokenLanguages),
    mentoringTopics: csv(initial.mentoringTopics),
    meetingCapacity:
      initial.meetingCapacity === null || initial.meetingCapacity === undefined
        ? "3"
        : String(initial.meetingCapacity),
    meetingDurationMinutes:
      initial.meetingDurationMinutes === null ||
      initial.meetingDurationMinutes === undefined
        ? "60"
        : String(initial.meetingDurationMinutes),
  };
}

const sectionLabelSx = {
  fontSize: "0.8rem",
  fontWeight: 800,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "#b05a75",
  mb: 0.5,
};

export default function MentorProfileForm({
  initial,
  submitLabel,
  submittingLabel,
  onSubmit,
  busy = false,
  error = "",
}) {
  const { t } = useLanguage();
  const mf = t.app.mentorForm;

  const [form, setForm] = useState(() => toFormValues(initial));
  const [fieldErrors, setFieldErrors] = useState({});

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const validate = () => {
    const errs = {};
    if (!form.background.trim()) errs.background = mf.required;

    const cap = Number(form.meetingCapacity);
    if (!Number.isInteger(cap) || cap <= 0) errs.meetingCapacity = mf.numberPositive;

    const dur = Number(form.meetingDurationMinutes);
    if (!Number.isInteger(dur) || dur <= 0) errs.meetingDurationMinutes = mf.numberPositive;

    if (form.yearsOfExperience !== "") {
      const n = Number(form.yearsOfExperience);
      if (!Number.isInteger(n) || n < 0) errs.yearsOfExperience = mf.numberPositive;
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (busy) return;
    if (!validate()) return;

    const payload = {
      background: form.background.trim(),
      meetingCapacity: Number(form.meetingCapacity),
      meetingDurationMinutes: Number(form.meetingDurationMinutes),
      jobTitle: form.jobTitle.trim(),
      workplace: form.workplace.trim(),
      yearsOfExperience:
        form.yearsOfExperience === "" ? null : Number(form.yearsOfExperience),
      linkedinUrl: form.linkedinUrl.trim(),
      githubUrl: form.githubUrl.trim(),
    };
    const topics = splitTags(form.mentoringTopics);
    const tech = splitTags(form.technologies);
    const spoken = splitTags(form.spokenLanguages);
    if (topics.length) payload.mentoringTopics = topics;
    if (tech.length) payload.technologies = tech;
    if (spoken.length) payload.spokenLanguages = spoken;

    onSubmit(payload);
  };

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Stack spacing={3}>
        <Box>
          <Typography sx={sectionLabelSx}>{mf.sectionAbout}</Typography>
          <Stack spacing={2}>
            <TextField
              label={mf.background}
              placeholder={mf.backgroundPlaceholder}
              value={form.background}
              onChange={set("background")}
              error={Boolean(fieldErrors.background)}
              helperText={fieldErrors.background || " "}
              multiline
              minRows={3}
              fullWidth
              required
            />
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
              <TextField label={mf.jobTitle} value={form.jobTitle} onChange={set("jobTitle")} fullWidth />
              <TextField label={mf.workplace} value={form.workplace} onChange={set("workplace")} fullWidth />
              <TextField
                label={mf.yearsOfExperience}
                value={form.yearsOfExperience}
                onChange={set("yearsOfExperience")}
                error={Boolean(fieldErrors.yearsOfExperience)}
                helperText={fieldErrors.yearsOfExperience || " "}
                inputProps={{ inputMode: "numeric" }}
                fullWidth
              />
              <TextField label={mf.linkedinUrl} value={form.linkedinUrl} onChange={set("linkedinUrl")} fullWidth />
            </Box>
            <TextField label={mf.githubUrl} value={form.githubUrl} onChange={set("githubUrl")} fullWidth />
            <TextField
              label={mf.technologies}
              placeholder={mf.technologiesPlaceholder}
              value={form.technologies}
              onChange={set("technologies")}
              helperText={mf.listHint}
              fullWidth
            />
            <TextField
              label={mf.spokenLanguages}
              placeholder={mf.spokenLanguagesPlaceholder}
              value={form.spokenLanguages}
              onChange={set("spokenLanguages")}
              helperText={mf.listHint}
              fullWidth
            />
          </Stack>
        </Box>

        <Box>
          <Typography sx={sectionLabelSx}>{mf.sectionMentoring}</Typography>
          <Stack spacing={2}>
            <TextField
              label={mf.mentoringTopics}
              placeholder={mf.mentoringTopicsPlaceholder}
              value={form.mentoringTopics}
              onChange={set("mentoringTopics")}
              helperText={mf.listHint}
              fullWidth
            />
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
              <TextField
                label={mf.meetingCapacity}
                value={form.meetingCapacity}
                onChange={set("meetingCapacity")}
                error={Boolean(fieldErrors.meetingCapacity)}
                helperText={fieldErrors.meetingCapacity || " "}
                inputProps={{ inputMode: "numeric" }}
                fullWidth
              />
              <TextField
                label={mf.meetingDurationMinutes}
                value={form.meetingDurationMinutes}
                onChange={set("meetingDurationMinutes")}
                error={Boolean(fieldErrors.meetingDurationMinutes)}
                helperText={fieldErrors.meetingDurationMinutes || " "}
                inputProps={{ inputMode: "numeric" }}
                fullWidth
              />
            </Box>
          </Stack>
        </Box>

        <Box>
          <Button type="submit" variant="contained" disabled={busy} sx={{ px: 4 }}>
            {busy ? submittingLabel : submitLabel}
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}
