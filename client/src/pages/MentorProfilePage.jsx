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
import { colors, fonts, radii, shadows } from "../theme/tokens";
import { useLanguage } from "../i18n/LanguageProvider";
import { ROUTES } from "../constants/routes";

// Temporary until Part 1 auth provides the logged-in user.
// Seed mentee: shira@example.com (id 4 after a fresh init + seed).
const TEMP_MENTEE_ID = 4;

function fill(template, vars) {
  return Object.entries(vars).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template
  );
}

/** Same rules as server parseId: positive integer route/user id. */
function isValidMentorRouteId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0;
}

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

async function fetchOpenRequest(mentorUserId) {
  const openResponse = await axios.get(
    `/api/mentors/${mentorUserId}/requests/open`,
    { params: { menteeId: TEMP_MENTEE_ID } }
  );
  return openResponse.data?.data ?? null;
}

/**
 * Mentor profile + request/cancel — rendered as `/app/mentors/:id` inside AppLayout.
 * Layout/nav/language chrome come from AppLayout + AppNav.
 */
export default function MentorProfilePage() {
  const { id } = useParams();
  const { t } = useLanguage();
  const copy = t.mentorProfile;

  const [mentor, setMentor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState("");
  const [serverError, setServerError] = useState("");

  // Persisted open request for this mentee + mentor (null = none / cancelled).
  const [openRequest, setOpenRequest] = useState(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [statusKey, setStatusKey] = useState("");
  const [requestErrorKey, setRequestErrorKey] = useState("");
  const [serverRequestError, setServerRequestError] = useState("");

  const hasOpenRequest = Boolean(openRequest);

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      setLoading(true);
      setErrorKey("");
      setServerError("");
      setMentor(null);
      setOpenRequest(null);
      setStatusKey("");
      setRequestErrorKey("");
      setServerRequestError("");

      try {
        // Malformed ids → not-found UI without relying on a blank success body.
        if (!isValidMentorRouteId(id)) {
          if (!cancelled) setErrorKey("notFound");
          return;
        }

        let mentorData = null;
        try {
          const mentorResponse = await axios.get(`/api/mentors/${id}`);
          mentorData = mentorResponse.data?.data ?? null;
          if (cancelled) return;

          // Successful response with null/incomplete payload must not blank the page.
          if (!mentorData?.userId) {
            setErrorKey("notFound");
            setMentor(null);
            return;
          }

          setMentor(mentorData);
        } catch (err) {
          if (cancelled) return;
          const status = err.response?.status;
          // 400 = invalid id from parseId; 404 = mentor missing
          if (status === 404 || status === 400) {
            setErrorKey("notFound");
            setServerError("");
          } else {
            setErrorKey("load");
            setServerError(err.response?.data?.message || "");
          }
          return;
        }

        // Open-request failures must not look like "mentor not found".
        try {
          const open = await fetchOpenRequest(mentorData.userId);
          if (!cancelled) setOpenRequest(open);
        } catch (err) {
          if (!cancelled) {
            setOpenRequest(null);
            setRequestErrorKey("openLoadFailed");
            setServerRequestError(err.response?.data?.message || "");
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
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
    setRequestErrorKey("");
    setServerRequestError("");
    setStatusKey("");

    try {
      const response = await axios.post(`/api/mentors/${mentor.userId}/requests`, {
        menteeId: TEMP_MENTEE_ID,
      });
      setOpenRequest(response.data?.data ?? { id: true });
      setStatusKey("sent");
      setConfirmOpen(false);
    } catch (err) {
      // 409 = backend found an existing open request for this pair
      if (err.response?.status === 409) {
        setOpenRequest(err.response.data?.data ?? { id: true });
        setRequestErrorKey("");
        setServerRequestError("");
        setStatusKey("alreadySent");
      } else {
        setRequestErrorKey("sendFailed");
        setServerRequestError(err.response?.data?.message || "");
      }
      setConfirmOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!openRequest?.id || cancelling) return;

    setCancelling(true);
    setRequestErrorKey("");
    setServerRequestError("");
    setStatusKey("");

    try {
      await axios.post(`/api/requests/${openRequest.id}/cancel`);
      setOpenRequest(null);
      setStatusKey("cancelled");
      setCancelOpen(false);
    } catch (err) {
      setCancelOpen(false);

      // Already closed (409): re-sync from DB so Cancel UI is not left stale.
      if (err.response?.status === 409 && mentor?.userId) {
        try {
          const fresh = await fetchOpenRequest(mentor.userId);
          setOpenRequest(fresh);
          if (!fresh) {
            setStatusKey("cancelled");
            setRequestErrorKey("");
            setServerRequestError("");
          } else {
            setRequestErrorKey("cancelFailed");
            setServerRequestError(err.response?.data?.message || "");
          }
        } catch (refreshErr) {
          setRequestErrorKey("cancelFailed");
          setServerRequestError(
            refreshErr.response?.data?.message ||
              err.response?.data?.message ||
              ""
          );
        }
      } else {
        setRequestErrorKey("cancelFailed");
        setServerRequestError(err.response?.data?.message || "");
      }
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
    .map((topic) => topic.trim())
    .filter(Boolean);

  const pageError =
    serverError ||
    (errorKey === "notFound"
      ? copy.notFound
      : errorKey === "load"
        ? copy.loadError
        : "");

  const statusText = statusKey ? copy.status[statusKey] : "";
  const requestErrorText =
    serverRequestError ||
    (requestErrorKey ? copy.errors[requestErrorKey] : "");

  const sendDialogBody = mentor
    ? fill(copy.confirmSend.bodyWithName, { name: mentor.username })
    : copy.confirmSend.bodyGeneric;

  const cancelDialogBody = mentor
    ? fill(copy.confirmCancel.bodyWithName, { name: mentor.username })
    : copy.confirmCancel.bodyGeneric;

  return (
    <Box sx={{ maxWidth: 720, mx: "auto" }}>
      <Box sx={{ mb: 2 }}>
        <Button
          component={RouterLink}
          to={ROUTES.APP}
          variant="text"
          sx={{ px: 0 }}
        >
          {copy.back}
        </Button>
      </Box>

      {loading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
          <CircularProgress />
        </Box>
      )}

      {!loading && pageError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {pageError}
        </Alert>
      )}

      {!loading && !pageError && mentor && (
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
                  copy.mentorFallback}
              </Typography>
            </Box>
          </Stack>

          <Stack spacing={2.25} sx={{ mb: 3 }}>
            <DetailRow label={copy.labels.background}>
              {mentor.background}
            </DetailRow>
            <DetailRow label={copy.labels.experience}>
              {mentor.yearsOfExperience != null
                ? fill(copy.years, { count: mentor.yearsOfExperience })
                : null}
            </DetailRow>
            <DetailRow label={copy.labels.techStack}>
              {mentor.techStack}
            </DetailRow>
            <DetailRow label={copy.labels.languages}>
              {mentor.programmingLanguages}
            </DetailRow>
            <DetailRow label={copy.labels.meetingLength}>
              {mentor.meetingDurationMins != null
                ? fill(copy.minutes, { count: mentor.meetingDurationMins })
                : null}
            </DetailRow>
            <DetailRow label={copy.labels.email}>
              {mentor.email ? (
                <Link href={`mailto:${mentor.email}`}>{mentor.email}</Link>
              ) : null}
            </DetailRow>
            <DetailRow label={copy.labels.github}>
              {mentor.githubUrl ? (
                <Link href={mentor.githubUrl} target="_blank" rel="noreferrer">
                  {mentor.githubUrl}
                </Link>
              ) : null}
            </DetailRow>
            <DetailRow label={copy.labels.linkedin}>
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
                {copy.labels.adviceTopics}
              </Typography>
              <Stack direction="row" flexWrap="wrap" useFlexGap gap={0.75}>
                {topics.map((topic) => (
                  <Chip key={topic} label={topic} variant="outlined" />
                ))}
              </Stack>
            </Box>
          )}

          {statusText && (
            <Alert
              severity={hasOpenRequest ? "success" : "info"}
              sx={{ mb: 2 }}
            >
              {statusText}
            </Alert>
          )}

          {hasOpenRequest && !statusText && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {copy.alreadySentBanner}
            </Alert>
          )}

          {requestErrorText && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {requestErrorText}
            </Alert>
          )}

          <Stack spacing={1.25}>
            <Button
              variant="contained"
              size="large"
              fullWidth
              disabled={submitting || hasOpenRequest}
              onClick={() => {
                setRequestErrorKey("");
                setServerRequestError("");
                setConfirmOpen(true);
              }}
            >
              {hasOpenRequest
                ? copy.requestAlreadySent
                : copy.requestMeeting}
            </Button>

            {hasOpenRequest && (
              <Button
                variant="outlined"
                color="inherit"
                size="large"
                fullWidth
                disabled={cancelling}
                onClick={() => {
                  setRequestErrorKey("");
                  setServerRequestError("");
                  setCancelOpen(true);
                }}
              >
                {copy.cancelRequest}
              </Button>
            )}
          </Stack>
        </Box>
      )}

      <Dialog
        open={confirmOpen}
        onClose={() => (!submitting ? setConfirmOpen(false) : null)}
      >
        <DialogTitle>{copy.confirmSend.title}</DialogTitle>
        <DialogContent>
          <DialogContentText>{sendDialogBody}</DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setConfirmOpen(false)}
            disabled={submitting}
            variant="text"
          >
            {copy.confirmSend.cancel}
          </Button>
          <Button
            onClick={handleConfirmRequest}
            disabled={submitting}
            variant="contained"
            autoFocus
          >
            {submitting ? copy.confirmSend.sending : copy.confirmSend.send}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={cancelOpen}
        onClose={() => (!cancelling ? setCancelOpen(false) : null)}
      >
        <DialogTitle>{copy.confirmCancel.title}</DialogTitle>
        <DialogContent>
          <DialogContentText>{cancelDialogBody}</DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setCancelOpen(false)}
            disabled={cancelling}
            variant="text"
          >
            {copy.confirmCancel.keep}
          </Button>
          <Button
            onClick={handleConfirmCancel}
            disabled={cancelling}
            variant="contained"
            color="error"
            autoFocus
          >
            {cancelling
              ? copy.confirmCancel.cancelling
              : copy.confirmCancel.confirm}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
