import React, { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import axios from "axios";
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

function MentorCard({ mentor }) {
  const initials = (mentor.username || "?")
    .split(/[\s_]+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const topics = (mentor.adviceTopics || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 3);

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
              "Mentor"}
          </Typography>
        </Box>
      </Stack>

      <Typography variant="body2" color="text.secondary">
        {mentor.yearsOfExperience != null
          ? `${mentor.yearsOfExperience} years experience`
          : "Experience not listed"}
        {mentor.meetingDurationMins != null
          ? ` · ${mentor.meetingDurationMins} min meetings`
          : ""}
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
        View Profile
      </Button>
    </Box>
  );
}

export default function MentorsPage() {
  const [mentors, setMentors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadMentors() {
      setLoading(true);
      setError("");

      try {
        // /api is forwarded to Express by src/setupProxy.js
        const response = await axios.get("/api/mentors");
        const list = response.data?.data ?? [];
        if (!cancelled) {
          setMentors(Array.isArray(list) ? list : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err.response?.data?.message ||
              "Could not load mentors. Is the server running?"
          );
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

  return (
    <Box
      sx={{
        minHeight: "100vh",
        px: { xs: 2.5, sm: 4 },
        py: { xs: 4, sm: 5 },
        background: gradients.page,
      }}
    >
      <Box sx={{ maxWidth: 1100, mx: "auto" }}>
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
          MentorMe
        </Typography>
        <Typography
          component="h1"
          variant="h5"
          sx={{ fontWeight: 700, mb: 0.75 }}
        >
          Find a mentor
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3.5, maxWidth: 480 }}>
          Browse mentors in the community and open a profile to request a
          meeting.
        </Typography>

        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        )}

        {!loading && error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {!loading && !error && mentors.length === 0 && (
          <Alert severity="info">No mentors yet. Check back soon.</Alert>
        )}

        {!loading && !error && mentors.length > 0 && (
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
              <MentorCard key={mentor.userId} mentor={mentor} />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}
