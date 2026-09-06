import React, { useEffect, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import axios from "axios";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Link,
  Stack,
  Typography,
} from "@mui/material";
import { colors, fonts, gradients, radii, shadows } from "../theme/tokens";

function DetailRow({ label, children }) {
  if (!children) return null;

  return (
    <Box>
      <Typography
        variant="caption"
        sx={{
          display: "block",
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: colors.text.muted,
          mb: 0.5,
        }}
      >
        {label}
      </Typography>
      <Typography variant="body1" sx={{ color: colors.text.primary }}>
        {children}
      </Typography>
    </Box>
  );
}

export default function MentorProfilePage() {
  const { id } = useParams();
  const [mentor, setMentor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadMentor() {
      setLoading(true);
      setError("");
      setMentor(null);

      try {
        const response = await axios.get(`/api/mentors/${id}`);
        if (!cancelled) {
          setMentor(response.data?.data ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          const status = err.response?.status;
          setError(
            status === 404
              ? "Mentor not found."
              : err.response?.data?.message ||
                  "Could not load this mentor. Is the server running?"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadMentor();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const initials = (mentor?.username || "?")
    .split(/[\s_]+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const topics = (mentor?.adviceTopics || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        px: { xs: 2.5, sm: 4 },
        py: { xs: 4, sm: 5 },
        background: gradients.page,
      }}
    >
      <Box sx={{ maxWidth: 720, mx: "auto" }}>
        <Button
          component={RouterLink}
          to="/mentors"
          variant="text"
          sx={{ mb: 2, px: 0 }}
        >
          ← Back to mentors
        </Button>

        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
            <CircularProgress />
          </Box>
        )}

        {!loading && error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {!loading && !error && mentor && (
          <Box
            sx={{
              p: { xs: 2.5, sm: 3.5 },
              borderRadius: `${radii.lg}px`,
              background: colors.overlay,
              border: `1px solid ${colors.border}`,
              backdropFilter: "blur(10px)",
              boxShadow: shadows.medium,
              animation: "mentorMeFadeUp 600ms ease-out both",
            }}
          >
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2.5}
              alignItems={{ xs: "flex-start", sm: "center" }}
              sx={{ mb: 3 }}
            >
              <Avatar
                src={mentor.profilePictureUrl || undefined}
                alt={mentor.username}
                sx={{
                  width: 88,
                  height: 88,
                  bgcolor: colors.pink[500],
                  fontFamily: fonts.display,
                  fontWeight: 700,
                  fontSize: "1.75rem",
                }}
              >
                {initials}
              </Avatar>
              <Box>
                <Typography
                  component="h1"
                  sx={{
                    fontFamily: fonts.display,
                    fontWeight: 700,
                    fontSize: { xs: "2rem", sm: "2.35rem" },
                    lineHeight: 1.1,
                    color: colors.pink[700],
                    letterSpacing: "-0.03em",
                  }}
                >
                  {mentor.username}
                </Typography>
                <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                  {[mentor.jobTitle, mentor.company].filter(Boolean).join(" · ") ||
                    "Mentor"}
                </Typography>
              </Box>
            </Stack>

            <Stack spacing={2.25} sx={{ mb: 3 }}>
              <DetailRow label="Background">{mentor.background}</DetailRow>
              <DetailRow label="Experience">
                {mentor.yearsOfExperience != null
                  ? `${mentor.yearsOfExperience} years`
                  : null}
              </DetailRow>
              <DetailRow label="Tech stack">{mentor.techStack}</DetailRow>
              <DetailRow label="Languages">
                {mentor.programmingLanguages}
              </DetailRow>
              <DetailRow label="Meeting length">
                {mentor.meetingDurationMins != null
                  ? `${mentor.meetingDurationMins} minutes`
                  : null}
              </DetailRow>
              <DetailRow label="Email">
                {mentor.email ? (
                  <Link href={`mailto:${mentor.email}`}>{mentor.email}</Link>
                ) : null}
              </DetailRow>
              <DetailRow label="GitHub">
                {mentor.githubUrl ? (
                  <Link href={mentor.githubUrl} target="_blank" rel="noreferrer">
                    {mentor.githubUrl}
                  </Link>
                ) : null}
              </DetailRow>
              <DetailRow label="LinkedIn">
                {mentor.linkedinUrl ? (
                  <Link
                    href={mentor.linkedinUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {mentor.linkedinUrl}
                  </Link>
                ) : null}
              </DetailRow>
            </Stack>

            {topics.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography
                  variant="caption"
                  sx={{
                    display: "block",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: colors.text.muted,
                    mb: 1,
                  }}
                >
                  Advice topics
                </Typography>
                <Stack direction="row" flexWrap="wrap" useFlexGap gap={0.75}>
                  {topics.map((topic) => (
                    <Chip key={topic} label={topic} variant="outlined" />
                  ))}
                </Stack>
              </Box>
            )}

            {/* Wired to POST /api/mentors/:mentorId/requests in the next task */}
            <Button variant="contained" size="large" fullWidth disabled>
              Request Meeting
            </Button>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 1.25, textAlign: "center" }}
            >
              Meeting request action will be connected in the next step.
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
