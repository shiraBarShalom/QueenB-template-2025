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
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Link,
  Stack,
  Typography,
} from "@mui/material";
import { colors, fonts, gradients, radii, shadows } from "../theme/tokens";

// Temporary until Part 1 auth provides the logged-in user.
// Seed mentee: shira@example.com (id 4 after a fresh init + seed).
const TEMP_MENTEE_ID = 4;

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

  // Persisted open request for this mentee + mentor (null = none / cancelled).
  const [openRequest, setOpenRequest] = useState(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const hasOpenRequest = Boolean(openRequest);

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      setLoading(true);
      setError("");
      setMentor(null);
      setOpenRequest(null);
      setRequestError("");
      setActionMessage("");

      try {
        const mentorResponse = await axios.get(`/api/mentors/${id}`);
        const mentorData = mentorResponse.data?.data ?? null;
        if (cancelled) return;

        setMentor(mentorData);

        if (mentorData?.userId) {
          const openResponse = await axios.get(
            `/api/mentors/${mentorData.userId}/requests/open`,
            { params: { menteeId: TEMP_MENTEE_ID } }
          );
          if (!cancelled) {
            setOpenRequest(openResponse.data?.data ?? null);
          }
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

    loadPage();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleConfirmRequest = async () => {
    if (!mentor || submitting || hasOpenRequest) return;

    setSubmitting(true);
    setRequestError("");
    setActionMessage("");

    try {
      const response = await axios.post(`/api/mentors/${mentor.userId}/requests`, {
        menteeId: TEMP_MENTEE_ID,
      });
      setOpenRequest(response.data?.data ?? { id: true });
      setActionMessage("Request sent. Waiting for mentor response.");
      setConfirmOpen(false);
    } catch (err) {
      // 409 = backend found an existing open request for this pair
      if (err.response?.status === 409) {
        setOpenRequest(err.response.data?.data ?? { id: true });
        setRequestError("");
        setActionMessage("Request already sent. Waiting for mentor response.");
      } else {
        setRequestError(
          err.response?.data?.message ||
            "Could not send the meeting request. Please try again."
        );
      }
      setConfirmOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!openRequest?.id || cancelling) return;

    setCancelling(true);
    setRequestError("");
    setActionMessage("");

    try {
      await axios.post(`/api/requests/${openRequest.id}/cancel`);
      setOpenRequest(null);
      setActionMessage("Request cancelled. You can send a new request.");
      setCancelOpen(false);
    } catch (err) {
      setRequestError(
        err.response?.data?.message ||
          "Could not cancel the request. Please try again."
      );
      setCancelOpen(false);
    } finally {
      setCancelling(false);
    }
  };

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

            {actionMessage && (
              <Alert
                severity={hasOpenRequest ? "success" : "info"}
                sx={{ mb: 2 }}
              >
                {actionMessage}
              </Alert>
            )}

            {hasOpenRequest && !actionMessage && (
              <Alert severity="success" sx={{ mb: 2 }}>
                Request already sent. Waiting for mentor response.
              </Alert>
            )}

            {requestError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {requestError}
              </Alert>
            )}

            <Stack spacing={1.25}>
              <Button
                variant="contained"
                size="large"
                fullWidth
                disabled={submitting || hasOpenRequest}
                onClick={() => {
                  setRequestError("");
                  setConfirmOpen(true);
                }}
              >
                {hasOpenRequest ? "Request already sent" : "Request Meeting"}
              </Button>

              {hasOpenRequest && (
                <Button
                  variant="outlined"
                  color="inherit"
                  size="large"
                  fullWidth
                  disabled={cancelling}
                  onClick={() => {
                    setRequestError("");
                    setCancelOpen(true);
                  }}
                >
                  Cancel Request
                </Button>
              )}
            </Stack>
          </Box>
        )}
      </Box>

      <Dialog
        open={confirmOpen}
        onClose={() => (!submitting ? setConfirmOpen(false) : null)}
      >
        <DialogTitle>Send meeting request?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {mentor
              ? `You are about to request a meeting with ${mentor.username}.`
              : "You are about to request a meeting."}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setConfirmOpen(false)}
            disabled={submitting}
            variant="text"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmRequest}
            disabled={submitting}
            variant="contained"
            autoFocus
          >
            {submitting ? "Sending…" : "Send request"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={cancelOpen}
        onClose={() => (!cancelling ? setCancelOpen(false) : null)}
      >
        <DialogTitle>Cancel this request?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {mentor
              ? `This will cancel your meeting request with ${mentor.username}. You can send a new request later.`
              : "This will cancel your meeting request. You can send a new request later."}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setCancelOpen(false)}
            disabled={cancelling}
            variant="text"
          >
            Keep request
          </Button>
          <Button
            onClick={handleConfirmCancel}
            disabled={cancelling}
            variant="contained"
            color="error"
            autoFocus
          >
            {cancelling ? "Cancelling…" : "Cancel request"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
