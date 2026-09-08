import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from "@mui/material";
import { Navigate, useNavigate } from "react-router-dom";
import PageShell from "../components/PageShell";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageProvider";
import { ROUTES } from "../constants/routes";
import {
  submitMentorApplication,
  updateAccount,
  updateProfile,
  updateRoles,
} from "../api/users";

const joinList = (value) => (value || []).join(", ");
const splitList = (value) =>
  value.split(",").map((item) => item.trim()).filter(Boolean);

export default function OnboardingPage() {
  const { user, setUser } = useAuth();
  const { t } = useLanguage();
  const copy = t.onboarding;
  const navigate = useNavigate();
  const profile = user.profile || {};
  const mentor = user.mentorProfile || {};
  const alreadyDone = Boolean(profile.onboardingComplete || user.onboardingComplete);

  const [form, setForm] = useState({
    displayName: user.displayName || "",
    roles: user.roles?.length ? user.roles : ["MENTEE"],
    background: profile.background || "",
    jobTitle: profile.jobTitle || "",
    company: profile.company || profile.workplace || "",
    yearsOfExperience: profile.yearsOfExperience ?? "",
    linkedinUrl: profile.linkedinUrl || "",
    githubUrl: profile.githubUrl || "",
    programmingLanguages: joinList(profile.programmingLanguages),
    techStack: joinList(profile.techStack || user.technologies),
    adviceTopics: joinList(mentor.adviceTopics || profile.mentoringTopics),
    maxMeetings: mentor.maxMeetings ?? profile.meetingCapacity ?? "",
    meetingDurationMinutes:
      mentor.meetingDurationMinutes ?? profile.meetingDurationMinutes ?? 45,
    acceptingRequests: mentor.acceptingRequests ?? true,
  });
  const wantsToMentor = form.roles.includes("MENTOR");
  const steps = useMemo(
    () => [
      { id: "goals", label: copy.goals },
      { id: "about", label: copy.about },
      { id: "work", label: copy.work },
      { id: "skills", label: copy.skills },
      ...(wantsToMentor ? [{ id: "mentor", label: copy.mentor }] : []),
      { id: "finish", label: copy.finish },
    ],
    [copy, wantsToMentor]
  );
  const [activeStep, setActiveStep] = useState(() =>
    Math.min(Number(sessionStorage.getItem("mentormeOnboardingStep") || 0), steps.length - 1)
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const currentStep = steps[activeStep]?.id;

  useEffect(() => {
    if (activeStep >= steps.length) {
      const nextStep = steps.length - 1;
      setActiveStep(nextStep);
      sessionStorage.setItem("mentormeOnboardingStep", String(nextStep));
    }
  }, [activeStep, steps.length]);

  const canContinue = () => {
    if (currentStep === "goals") return form.roles.length > 0;
    if (currentStep === "about") return form.displayName.trim().length >= 2;
    return true;
  };

  const change = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const toggleRole = (role) => {
    setForm((current) => {
      const hasRole = current.roles.includes(role);
      const roles = hasRole
        ? current.roles.filter((item) => item !== role)
        : [...current.roles, role];
      return { ...current, roles: roles.length ? roles : [role] };
    });
  };

  const mentorPayload = () => ({
    adviceTopics: splitList(form.adviceTopics),
    maxMeetings: form.maxMeetings === "" ? null : Number(form.maxMeetings),
    meetingDurationMinutes: Number(form.meetingDurationMinutes),
    acceptingRequests: form.acceptingRequests,
  });

  const saveStep = async () => {
    let nextUser = user;
    if (currentStep === "goals") {
      nextUser = await updateRoles(form.roles);
      if (form.roles.includes("MENTOR")) {
        nextUser = await submitMentorApplication(mentorPayload());
      }
    }
    if (currentStep === "about") {
      nextUser = await updateAccount({ displayName: form.displayName.trim() });
      nextUser = await updateProfile({ background: form.background || null });
    }
    if (currentStep === "work") {
      nextUser = await updateProfile({
        jobTitle: form.jobTitle || null,
        company: form.company || null,
        yearsOfExperience: form.yearsOfExperience === "" ? null : Number(form.yearsOfExperience),
        linkedinUrl: form.linkedinUrl || null,
        githubUrl: form.githubUrl || null,
      });
    }
    if (currentStep === "skills") {
      nextUser = await updateProfile({
        programmingLanguages: splitList(form.programmingLanguages),
        techStack: splitList(form.techStack),
      });
    }
    if (currentStep === "mentor") {
      nextUser = await submitMentorApplication(mentorPayload());
    }
    if (currentStep === "finish") {
      nextUser = await updateProfile({ onboardingComplete: true });
    }
    setUser(nextUser);
    return nextUser;
  };

  const next = async () => {
    setSaving(true);
    setError("");
    try {
      const nextUser = await saveStep();
      if (activeStep === steps.length - 1) {
        sessionStorage.removeItem("mentormeOnboardingStep");
        navigate(nextUser.isAdmin ? "/admin" : ROUTES.APP, { replace: true });
      } else {
        const nextStep = activeStep + 1;
        setActiveStep(nextStep);
        sessionStorage.setItem("mentormeOnboardingStep", String(nextStep));
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || copy.saveError);
    } finally {
      setSaving(false);
    }
  };

  if (alreadyDone && !user.isAdmin) {
    return <Navigate to={ROUTES.APP} replace />;
  }

  return (
    <PageShell title={copy.title} subtitle={copy.subtitle} maxWidth={850} showLanguage>
      <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 4 }}>
        {steps.map((step) => (
          <Step key={step.id}>
            <StepLabel>{step.label}</StepLabel>
          </Step>
        ))}
      </Stepper>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Stack spacing={2.25}>
        {currentStep === "goals" && (
          <>
            <Typography variant="h5">{copy.question}</Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={form.roles.includes("MENTEE")}
                  onChange={() => toggleRole("MENTEE")}
                />
              }
              label={copy.wantMentor}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={form.roles.includes("MENTOR")}
                  onChange={() => toggleRole("MENTOR")}
                />
              }
              label={copy.wantToMentor}
            />
            <Typography color="text.secondary">{copy.mentorPendingNote}</Typography>
          </>
        )}
        {currentStep === "about" && (
          <>
            <TextField
              required
              label={copy.displayName}
              value={form.displayName}
              onChange={change("displayName")}
            />
            <TextField
              label={copy.aboutYou}
              multiline
              minRows={5}
              value={form.background}
              onChange={change("background")}
            />
          </>
        )}
        {currentStep === "work" && (
          <>
            <TextField label={copy.jobTitle} value={form.jobTitle} onChange={change("jobTitle")} />
            <TextField label={copy.company} value={form.company} onChange={change("company")} />
            <TextField
              label={copy.years}
              type="number"
              inputProps={{ min: 0, max: 80 }}
              value={form.yearsOfExperience}
              onChange={change("yearsOfExperience")}
            />
            <TextField
              label={copy.linkedin}
              value={form.linkedinUrl}
              onChange={change("linkedinUrl")}
            />
            <TextField
              label={copy.github}
              value={form.githubUrl}
              onChange={change("githubUrl")}
            />
          </>
        )}
        {currentStep === "skills" && (
          <>
            <TextField
              label={copy.languages}
              helperText={copy.commaHint}
              value={form.programmingLanguages}
              onChange={change("programmingLanguages")}
            />
            <TextField
              label={copy.tech}
              helperText={copy.commaHint}
              value={form.techStack}
              onChange={change("techStack")}
            />
          </>
        )}
        {currentStep === "mentor" && (
          <>
            <Alert severity="info">{copy.mentorPendingNote}</Alert>
            <TextField
              label={copy.advice}
              helperText={copy.commaHint}
              value={form.adviceTopics}
              onChange={change("adviceTopics")}
            />
            <TextField
              label={copy.maxMeetings}
              type="number"
              inputProps={{ min: 1, max: 100 }}
              value={form.maxMeetings}
              onChange={change("maxMeetings")}
            />
            <TextField
              select
              label={copy.duration}
              value={form.meetingDurationMinutes}
              onChange={change("meetingDurationMinutes")}
            >
              {[30, 45, 60, 90].map((minutes) => (
                <MenuItem key={minutes} value={minutes}>
                  {minutes} {copy.minutes}
                </MenuItem>
              ))}
            </TextField>
            <FormControlLabel
              control={
                <Checkbox
                  checked={form.acceptingRequests}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      acceptingRequests: event.target.checked,
                    }))
                  }
                />
              }
              label={copy.accepting}
            />
          </>
        )}
        {currentStep === "finish" && (
          <Box>
            <Typography variant="h5" sx={{ mb: 1 }}>
              {copy.readyTitle}
            </Typography>
            <Typography color="text.secondary">{copy.readyBody}</Typography>
          </Box>
        )}
        <Stack direction="row" justifyContent="space-between">
          <Button
            disabled={activeStep === 0 || saving}
            onClick={() => setActiveStep((step) => step - 1)}
          >
            {copy.back}
          </Button>
          <Button variant="contained" disabled={saving || !canContinue()} onClick={next}>
            {saving ? copy.saving : activeStep === steps.length - 1 ? copy.complete : copy.save}
          </Button>
        </Stack>
      </Stack>
    </PageShell>
  );
}
