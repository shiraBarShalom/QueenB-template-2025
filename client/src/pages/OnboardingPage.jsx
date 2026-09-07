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
import { useNavigate } from "react-router-dom";
import PageShell from "../components/PageShell";
import { useAuth } from "../context/AuthContext";
import {
  updateAccount,
  updateMentorProfile,
  updateProfile,
  updateRoles,
} from "../api/users";

const joinList = (value) => (value || []).join(", ");
const splitList = (value) =>
  value.split(",").map((item) => item.trim()).filter(Boolean);

export default function OnboardingPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const profile = user.profile || {};
  const mentor = user.mentorProfile || {};
  const [form, setForm] = useState({
    displayName: user.displayName || "",
    roles: user.roles?.length ? user.roles : ["MENTEE"],
    background: profile.background || "",
    jobTitle: profile.jobTitle || "",
    company: profile.company || "",
    yearsOfExperience: profile.yearsOfExperience ?? "",
    linkedinUrl: profile.linkedinUrl || "",
    githubUrl: profile.githubUrl || "",
    programmingLanguages: joinList(profile.programmingLanguages),
    techStack: joinList(profile.techStack),
    adviceTopics: joinList(mentor.adviceTopics),
    maxMeetings: mentor.maxMeetings ?? "",
    meetingDurationMinutes: mentor.meetingDurationMinutes ?? 45,
    acceptingRequests: mentor.acceptingRequests ?? true,
  });
  const mentorSelected = form.roles.includes("MENTOR");
  const steps = useMemo(
    () => ["Your goals", "About you", "Work and links", "Skills", ...(mentorSelected ? ["Mentor setup"] : []), "Finish"],
    [mentorSelected]
  );
  const [activeStep, setActiveStep] = useState(() =>
    Math.min(Number(sessionStorage.getItem("mentormeOnboardingStep") || 0), steps.length - 1)
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (activeStep >= steps.length) {
      const nextStep = steps.length - 1;
      setActiveStep(nextStep);
      sessionStorage.setItem("mentormeOnboardingStep", String(nextStep));
    }
  }, [activeStep, steps.length]);

  const canContinue = () => {
    const label = steps[activeStep];
    if (label === "Your goals") return form.roles.length > 0;
    if (label === "About you") return form.displayName.trim().length >= 2;
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

  const saveStep = async () => {
    const label = steps[activeStep];
    let nextUser = user;
    if (label === "Your goals") nextUser = await updateRoles(form.roles);
    if (label === "About you") {
      nextUser = await updateAccount({ displayName: form.displayName.trim() });
      nextUser = await updateProfile({ background: form.background || null });
    }
    if (label === "Work and links") {
      nextUser = await updateProfile({
        jobTitle: form.jobTitle || null,
        company: form.company || null,
        yearsOfExperience: form.yearsOfExperience === "" ? null : Number(form.yearsOfExperience),
        linkedinUrl: form.linkedinUrl || null,
        githubUrl: form.githubUrl || null,
      });
    }
    if (label === "Skills") {
      nextUser = await updateProfile({
        programmingLanguages: splitList(form.programmingLanguages),
        techStack: splitList(form.techStack),
      });
    }
    if (label === "Mentor setup") {
      nextUser = await updateMentorProfile({
        adviceTopics: splitList(form.adviceTopics),
        maxMeetings: form.maxMeetings === "" ? null : Number(form.maxMeetings),
        meetingDurationMinutes: Number(form.meetingDurationMinutes),
        acceptingRequests: form.acceptingRequests,
      });
    }
    if (label === "Finish") {
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
        navigate(nextUser.isAdmin ? "/admin" : "/home", { replace: true });
      } else {
        const nextStep = activeStep + 1;
        setActiveStep(nextStep);
        sessionStorage.setItem("mentormeOnboardingStep", String(nextStep));
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not save this step.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell title="Build your MentorMe profile" subtitle="Your progress is saved after every step." maxWidth={850}>
      <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 4 }}>
        {steps.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
      </Stepper>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Stack spacing={2.25}>
        {steps[activeStep] === "Your goals" && (
          <>
            <Typography variant="h5">What brings you to MentorMe?</Typography>
            <FormControlLabel control={<Checkbox checked={form.roles.includes("MENTEE")} onChange={() => toggleRole("MENTEE")} />} label="I want to find a mentor" />
            <FormControlLabel control={<Checkbox checked={form.roles.includes("MENTOR")} onChange={() => toggleRole("MENTOR")} />} label="I want to mentor others" />
          </>
        )}
        {steps[activeStep] === "About you" && (
          <>
            <TextField required label="Display name" value={form.displayName} onChange={change("displayName")} />
            <TextField label="Tell the community about yourself" multiline minRows={5} value={form.background} onChange={change("background")} />
          </>
        )}
        {steps[activeStep] === "Work and links" && (
          <>
            <TextField label="Job title" value={form.jobTitle} onChange={change("jobTitle")} />
            <TextField label="Company" value={form.company} onChange={change("company")} />
            <TextField label="Years of experience" type="number" inputProps={{ min: 0, max: 80 }} value={form.yearsOfExperience} onChange={change("yearsOfExperience")} />
            <TextField label="LinkedIn URL (HTTPS)" value={form.linkedinUrl} onChange={change("linkedinUrl")} />
            <TextField label="GitHub URL (HTTPS)" value={form.githubUrl} onChange={change("githubUrl")} />
          </>
        )}
        {steps[activeStep] === "Skills" && (
          <>
            <TextField label="Programming languages" helperText="Separate items with commas" value={form.programmingLanguages} onChange={change("programmingLanguages")} />
            <TextField label="Technology stack" helperText="Separate items with commas" value={form.techStack} onChange={change("techStack")} />
          </>
        )}
        {steps[activeStep] === "Mentor setup" && (
          <>
            <TextField label="Advice topics" helperText="Separate items with commas" value={form.adviceTopics} onChange={change("adviceTopics")} />
            <TextField label="Maximum meetings" type="number" inputProps={{ min: 1, max: 100 }} value={form.maxMeetings} onChange={change("maxMeetings")} />
            <TextField select label="Meeting duration" value={form.meetingDurationMinutes} onChange={change("meetingDurationMinutes")}>
              {[30, 45, 60, 90].map((minutes) => <MenuItem key={minutes} value={minutes}>{minutes} minutes</MenuItem>)}
            </TextField>
            <FormControlLabel control={<Checkbox checked={form.acceptingRequests} onChange={(event) => setForm((current) => ({ ...current, acceptingRequests: event.target.checked }))} />} label="Accept mentoring requests now" />
          </>
        )}
        {steps[activeStep] === "Finish" && (
          <Box>
            <Typography variant="h5" sx={{ mb: 1 }}>Ready to join the community?</Typography>
            <Typography color="text.secondary">You can return and update these details at any time.</Typography>
          </Box>
        )}
        <Stack direction="row" justifyContent="space-between">
          <Button disabled={activeStep === 0 || saving} onClick={() => setActiveStep((step) => step - 1)}>Back</Button>
          <Button variant="contained" disabled={saving || !canContinue()} onClick={next}>
            {saving ? "Saving…" : activeStep === steps.length - 1 ? "Complete profile" : "Save and continue"}
          </Button>
        </Stack>
      </Stack>
    </PageShell>
  );
}
