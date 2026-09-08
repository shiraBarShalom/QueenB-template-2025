import React, { useEffect, useState } from "react";
import { Link as RouterLink, Navigate } from "react-router-dom";
import { Alert, Box, Button, CircularProgress, Snackbar } from "@mui/material";

import { ROUTES } from "../../constants/routes";
import { useLanguage } from "../../i18n/LanguageProvider";
import { useAuth } from "../../context/AuthContext";
import { useCurrentUser } from "../../auth/useCurrentUser";
import { getMyMentorProfile, updateMyMentorProfile } from "../../api/profile";
import PageHeader from "../../components/app/PageHeader";
import ContentCard from "../../components/app/ContentCard";
import MentorProfileForm from "../../components/app/mentor/MentorProfileForm";
import { splitTags } from "../../utils/tags";

/**
 * `/app/mentor-profile` — an existing mentor views / edits her own MentorProfile.
 *
 * Loads the current values from GET /api/users/me/mentor-profile (the same
 * projection mentor discovery uses) and saves through
 * PATCH /api/users/me/mentor-profile, so changes immediately affect what
 * mentees see in discovery.
 */

export default function MentorProfileEditPage() {
  const { t } = useLanguage();
  const c = t.app.mentorProfileEdit;
  const { setUser } = useAuth();
  const { isMentor, loading: authLoading } = useCurrentUser();

  const [phase, setPhase] = useState("loading"); // "loading" | "ready" | "error"
  const [initial, setInitial] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (authLoading || !isMentor) return undefined;
    let cancelled = false;

    (async () => {
      setPhase("loading");
      try {
        const m = await getMyMentorProfile();
        if (cancelled) return;
        setInitial({
          background: m.background,
          jobTitle: m.jobTitle,
          workplace: m.company,
          yearsOfExperience: m.yearsOfExperience,
          linkedinUrl: m.linkedinUrl,
          githubUrl: m.githubUrl,
          technologies: splitTags(m.techStack),
          spokenLanguages: splitTags(m.spokenLanguages || []),
          mentoringTopics: splitTags(m.adviceTopics),
          meetingCapacity: m.maxMeetings,
          meetingDurationMinutes: m.meetingDurationMins,
        });
        setPhase("ready");
      } catch {
        if (!cancelled) setPhase("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, isMentor]);

  if (!authLoading && !isMentor) {
    return <Navigate to={ROUTES.APP_BECOME_MENTOR} replace />;
  }

  const handleSubmit = async (payload) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await updateMyMentorProfile(payload);
      if (res?.user) setUser(res.user);
      setToast({ severity: "success", message: c.saveSuccess });
    } catch (err) {
      setError(err?.response?.data?.message || c.saveError);
    } finally {
      setBusy(false);
    }
  };

  const backButton = (
    <Button component={RouterLink} to={ROUTES.APP_MENTOR_AREA} variant="text" sx={{ px: 0 }}>
      {c.backToMentorArea}
    </Button>
  );

  return (
    <Box>
      <Box sx={{ mb: 1 }}>{backButton}</Box>
      <PageHeader title={c.title} description={c.description} />

      <ContentCard sx={{ maxWidth: 760 }}>
        {phase === "loading" && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress />
          </Box>
        )}

        {phase === "error" && <Alert severity="error">{c.loadError}</Alert>}

        {phase === "ready" && initial && (
          <MentorProfileForm
            initial={initial}
            submitLabel={c.save}
            submittingLabel={c.saving}
            onSubmit={handleSubmit}
            busy={busy}
            error={error}
          />
        )}
      </ContentCard>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={4000}
        onClose={(_e, reason) => {
          if (reason !== "clickaway") setToast(null);
        }}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {toast ? (
          <Alert severity={toast.severity} variant="filled" onClose={() => setToast(null)} sx={{ fontWeight: 600 }}>
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
