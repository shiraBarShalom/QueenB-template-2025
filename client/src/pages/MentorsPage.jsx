import React, { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import axios from "axios";
import { ThemeProvider } from "@mui/material/styles";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";
import { colors, fonts, gradients, radii, shadows } from "../theme/tokens";
import { useLanguage } from "../i18n/LanguageProvider";
import LanguageSwitcher from "../components/common/LanguageSwitcher";

function fill(template, vars) {
  return Object.entries(vars).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template
  );
}

function MentorCard({ mentor, copy }) {
  const initials = (mentor.username || "?")
    .split(/[\s_]+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const topics = (mentor.adviceTopics || "")
    .split(",")
    .map((topic) => topic.trim())
    .filter(Boolean)
    .slice(0, 3);

  const experienceText =
    mentor.yearsOfExperience != null
      ? fill(copy.card.yearsExperience, { count: mentor.yearsOfExperience })
      : copy.card.experienceUnknown;

  const meetingText =
    mentor.meetingDurationMins != null
      ? ` · ${fill(copy.card.meetingMins, {
          count: mentor.meetingDurationMins,
        })}`
      : "";

  return (
    <Box
      component="article"
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
        p: { xs: 2.25, sm: 2.75 },
        height: "100%",
        borderRadius: `${radii.lg}px`,
        background: colors.overlay,
        border: `1px solid ${colors.border}`,
        backdropFilter: "blur(10px)",
        boxShadow: shadows.soft,
        transition: "transform 180ms ease, box-shadow 180ms ease",
        animation: "mentorMeFadeUp 600ms ease-out both",
        "&:hover": {
          transform: "translateY(-3px)",
          boxShadow: shadows.medium,
        },
      }}
    >
      <Stack direction="row" spacing={1.75} alignItems="center">
        <Avatar
          src={mentor.profilePictureUrl || undefined}
          alt={mentor.username}
          sx={{
            width: 56,
            height: 56,
            bgcolor: colors.pink[500],
            fontFamily: fonts.display,
            fontWeight: 700,
          }}
        >
          {initials}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="h2"
            sx={{
              fontFamily: fonts.display,
              fontWeight: 700,
              fontSize: "1.25rem",
              lineHeight: 1.2,
              color: colors.pink[700],
            }}
          >
            {mentor.username}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {[mentor.jobTitle, mentor.company].filter(Boolean).join(" · ") ||
              copy.card.mentorFallback}
          </Typography>
        </Box>
      </Stack>

      <Typography variant="body2" color="text.secondary">
        {experienceText}
        {meetingText}
      </Typography>

      {mentor.techStack && (
        <Typography variant="body2" sx={{ color: colors.text.primary }}>
          {mentor.techStack}
        </Typography>
      )}

      {topics.length > 0 && (
        <Stack direction="row" flexWrap="wrap" useFlexGap gap={0.75}>
          {topics.map((topic) => (
            <Chip key={topic} label={topic} size="small" variant="outlined" />
          ))}
        </Stack>
      )}

      <Box sx={{ flexGrow: 1 }} />

      <Button
        component={RouterLink}
        to={`/mentors/${mentor.userId}`}
        variant="contained"
        fullWidth
      >
        {copy.card.viewProfile}
      </Button>
    </Box>
  );
}

export default function MentorsPage() {
  const { dir, t, fonts: langFonts, theme } = useLanguage();
  const copy = t.mentors;

  const [mentors, setMentors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState("");
  const [serverError, setServerError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadMentors() {
      setLoading(true);
      setErrorKey("");
      setServerError("");

      try {
        // /api is forwarded to Express by src/setupProxy.js
        const response = await axios.get("/api/mentors");
        const list = response.data?.data ?? [];
        if (!cancelled) {
          setMentors(Array.isArray(list) ? list : []);
        }
      } catch (err) {
        if (!cancelled) {
          setErrorKey("load");
          setServerError(err.response?.data?.message || "");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadMentors();
    return () => {
      cancelled = true;
    };
  }, []);

  const errorText = serverError || (errorKey === "load" ? copy.loadError : "");

  return (
    <ThemeProvider theme={theme}>
      <Box
        dir={dir}
        sx={{
          "--mq-font-body": langFonts.body,
          "--mq-font-display": langFonts.display,
          direction: dir,
          fontFamily: "var(--mq-font-body)",
          minHeight: "100vh",
          px: { xs: 2.5, sm: 4 },
          py: { xs: 4, sm: 5 },
          background: gradients.page,
        }}
      >
        <Box sx={{ maxWidth: 1100, mx: "auto" }}>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="flex-start"
            spacing={2}
            sx={{ mb: 3.5 }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography
                component="p"
                sx={{
                  fontFamily: fonts.display,
                  fontWeight: 700,
                  fontSize: { xs: "2rem", sm: "2.5rem" },
                  color: colors.pink[700],
                  letterSpacing: "-0.03em",
                  mb: 0.5,
                }}
              >
                {copy.brand}
              </Typography>
              <Typography
                component="h1"
                variant="h5"
                sx={{ fontWeight: 700, mb: 0.75 }}
              >
                {copy.title}
              </Typography>
              <Typography color="text.secondary" sx={{ maxWidth: 480 }}>
                {copy.subtitle}
              </Typography>
            </Box>

            <LanguageSwitcher variant="button" label={t.nav.language} />
          </Stack>

          {loading && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
              <CircularProgress />
            </Box>
          )}

          {!loading && errorText && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {errorText}
            </Alert>
          )}

          {!loading && !errorText && mentors.length === 0 && (
            <Alert severity="info">{copy.empty}</Alert>
          )}

          {!loading && !errorText && mentors.length > 0 && (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, 1fr)",
                  md: "repeat(3, 1fr)",
                },
                gap: 2.5,
              }}
            >
              {mentors.map((mentor) => (
                <MentorCard key={mentor.userId} mentor={mentor} copy={copy} />
              ))}
            </Box>
          )}
        </Box>
      </Box>
    </ThemeProvider>
  );
}
