import React, { useState } from "react";
import { Link as RouterLink, Navigate } from "react-router-dom";
import { Box, Button, Stack, Typography } from "@mui/material";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";

import { ROUTES } from "../../constants/routes";
import { useLanguage } from "../../i18n/LanguageProvider";
import { useAuth } from "../../context/AuthContext";
import { useCurrentUser } from "../../auth/useCurrentUser";
import { becomeMentor } from "../../api/profile";
import PageHeader from "../../components/app/PageHeader";
import ContentCard from "../../components/app/ContentCard";
import MentorProfileForm from "../../components/app/mentor/MentorProfileForm";

/**
 * `/app/become-a-mentor` — the REAL mentor onboarding flow.
 *
 * A normal authenticated user fills the mentor-details form; on submit we
 * POST /api/users/me/mentor-profile, which creates her MentorProfile (and
 * persists the profile fields on her User) in the existing architecture. She
 * keeps every bit of her mentee history — becoming a mentor only ADDS a role.
 *
 * If she is already a mentor this page just points her at the edit screen.
 */
export default function BecomeMentorPage() {
  const { t } = useLanguage();
  const c = t.app.becomeMentor;
  const { user, setUser } = useAuth();
  const { isMentor } = useCurrentUser();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // Success state — shown right after onboarding, before any navigation.
  if (done) {
    return (
      <Box>
        <PageHeader title={c.title} description={c.description} />
        <ContentCard sx={{ maxWidth: 640 }}>
          <Stack spacing={2.5} alignItems="flex-start">
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: "16px",
                display: "grid",
                placeItems: "center",
                color: "#1a7f4b",
                backgroundColor: "rgba(26,127,75,0.12)",
              }}
            >
              <CheckCircleRoundedIcon />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 800, color: "#4a1528" }}>
              {c.successTitle}
            </Typography>
            <Typography sx={{ color: "#6d3049", lineHeight: 1.8 }}>{c.successBody}</Typography>
            <Stack direction="row" spacing={1.5}>
              <Button component={RouterLink} to={ROUTES.APP} variant="contained">
                {c.pendingCta || c.goToMentorArea}
              </Button>
            </Stack>
          </Stack>
        </ContentCard>
      </Box>
    );
  }

  // Already a mentor (and didn't just onboard here) — send her to the edit page.
  if (isMentor) {
    return <Navigate to={ROUTES.APP_MENTOR_PROFILE_EDIT} replace />;
  }

  const handleSubmit = async (payload) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await becomeMentor(payload);
      if (res?.user) setUser(res.user);
      setDone(true);
    } catch (err) {
      setError(err?.response?.data?.message || c.error);
      setBusy(false);
    }
  };

  const initial = {
    jobTitle: user?.profile?.jobTitle,
    workplace: user?.profile?.workplace || user?.profile?.company,
    yearsOfExperience: user?.profile?.yearsOfExperience,
    linkedinUrl: user?.profile?.linkedinUrl,
    githubUrl: user?.profile?.githubUrl,
    technologies: user?.technologies,
    spokenLanguages: user?.spokenLanguages,
  };

  return (
    <Box>
      <PageHeader title={c.title} description={c.description} />
      <ContentCard sx={{ maxWidth: 760 }}>
        <MentorProfileForm
          initial={initial}
          submitLabel={c.submit}
          submittingLabel={c.submitting}
          onSubmit={handleSubmit}
          busy={busy}
          error={error}
        />
      </ContentCard>
    </Box>
  );
}
