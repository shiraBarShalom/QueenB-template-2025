import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";

import { useLanguage } from "../../i18n/LanguageProvider";
import { useCurrentUser } from "../../auth/useCurrentUser";
import { ROUTES } from "../../constants/routes";
import fillTemplate from "../../utils/fillTemplate";
import { isPastStart, toPayloadSlot } from "../../utils/slotTime";
import {
  fetchMentoringRequest,
  proposeMentoringRequestSlots,
} from "../../api/mentorScheduling";
import PageHeader from "../../components/app/PageHeader";
import ContentCard from "../../components/app/ContentCard";
import EmptyState from "../../components/app/EmptyState";
import SlotPicker from "../../components/app/mentor/SlotPicker";
import SelectedSlotList from "../../components/app/mentor/SelectedSlotList";

/**
 * `/app/mentor-area/requests/:requestId/propose-slots` — Part 3.
 *
 * The mentor picks 2–3 future start times; each becomes { startTime, endTime }
 * where endTime = startTime + mentorProfile.meetingDurationMinutes (the mentor's
 * own configured meeting length, already returned by GET /api/requests/:id — no
 * new endpoint, no invented duration). Submitting calls the Part 1 endpoint
 * POST /api/requests/:id/propose-slots, which is the single authority for the
 * WAITING_FOR_MENTOR_SLOTS -> WAITING_FOR_MENTEE_SELECTION transition and for
 * the atomic SchedulingRound + OfferedSlot creation. This page only mirrors the
 * slot-count / future-time rules for UX.
 */

const MIN_SLOTS = 2;
const MAX_SLOTS = 3;

export default function ProposeSlotsPage() {
  const { t, dir } = useLanguage();
  const c = t.app.mentorArea.proposeSlots;
  const { requestId } = useParams();
  const navigate = useNavigate();
  const { id: actingUserId } = useCurrentUser();

  const [phase, setPhase] = useState("loading"); // "loading" | "ready" | "error"
  const [errorKind, setErrorKind] = useState(null); // "load" | "notFound" | "forbidden" | "changed"
  const [request, setRequest] = useState(null);
  const [slots, setSlots] = useState([]); // [{ startMs }]
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const durationMinutes = request?.mentorProfile?.meetingDurationMinutes;

  const loadRequest = useCallback(async () => {
    setPhase("loading");
    setErrorKind(null);
    setFormError(null);
    try {
      const data = await fetchMentoringRequest(requestId);
      const duration = data?.mentorProfile?.meetingDurationMinutes;
      if (data.status !== "WAITING_FOR_MENTOR_SLOTS") {
        setRequest(data);
        setErrorKind("changed");
        setPhase("error");
        return;
      }
      if (!Number.isFinite(duration) || duration <= 0) {
        setErrorKind("load");
        setPhase("error");
        return;
      }
      setRequest(data);
      setPhase("ready");
    } catch (err) {
      setErrorKind(err.status === 404 ? "notFound" : "load");
      setPhase("error");
    }
  }, [requestId]);

  useEffect(() => {
    loadRequest();
  }, [loadRequest]);

  const hasPast = useMemo(() => slots.some((s) => isPastStart(s.startMs)), [slots]);
  const countOk = slots.length >= MIN_SLOTS && slots.length <= MAX_SLOTS;
  const canSubmit = phase === "ready" && countOk && !hasPast && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return; // guards double-submit + invalid state
    setSubmitting(true);
    setFormError(null);
    const payload = [...slots]
      .sort((a, b) => a.startMs - b.startMs)
      .map((s) => toPayloadSlot(s.startMs, durationMinutes));
    try {
      await proposeMentoringRequestSlots(requestId, actingUserId, payload);
      navigate(ROUTES.APP_MENTOR_AREA, { state: { flash: "slotsProposed" } });
    } catch (err) {
      if (err.status === 409) {
        setErrorKind("changed");
        setPhase("error");
      } else if (err.status === 404) {
        setErrorKind("notFound");
        setPhase("error");
      } else if (err.status === 403) {
        setErrorKind("forbidden");
        setPhase("error");
      } else {
        // 400 (bad payload) or anything else — stay on the picker, show why.
        setFormError(err.message || c.error400);
        setSubmitting(false);
      }
    }
  };

  // ---- error / loading screens -------------------------------------------
  if (phase === "loading") {
    return (
      <Box>
        <PageHeader title={c.titleNoName} />
        <ContentCard sx={{ maxWidth: 720 }}>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 2 }}>
            <CircularProgress size={20} />
            <Typography aria-live="polite" sx={{ color: "#6d3049" }}>
              {c.loading}
            </Typography>
          </Stack>
        </ContentCard>
      </Box>
    );
  }

  if (phase === "error") {
    const copy = {
      load: { title: c.loadError, body: null },
      notFound: { title: c.notFoundTitle, body: c.notFoundBody },
      forbidden: { title: c.forbiddenTitle, body: c.forbiddenBody },
      changed: { title: c.changedTitle, body: c.changedBody },
    }[errorKind] || { title: c.loadError, body: null };

    return (
      <Box>
        <PageHeader title={c.titleNoName} />
        <ContentCard sx={{ maxWidth: 720 }}>
          <EmptyState
            icon={ErrorOutlineRoundedIcon}
            title={copy.title}
            hint={copy.body}
            action={
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                {errorKind === "load" && (
                  <Button variant="outlined" onClick={loadRequest}>
                    {c.retry}
                  </Button>
                )}
                <Button
                  component={RouterLink}
                  to={ROUTES.APP_MENTOR_AREA}
                  variant="contained"
                  startIcon={
                    <ArrowBackRoundedIcon
                      sx={{ transform: dir === "rtl" ? "scaleX(-1)" : "none" }}
                    />
                  }
                >
                  {c.back}
                </Button>
              </Stack>
            }
          />
        </ContentCard>
      </Box>
    );
  }

  // ---- ready -----------------------------------------------------------
  const menteeName = request?.mentee?.fullName;

  return (
    <Box>
      <PageHeader
        title={
          menteeName
            ? fillTemplate(c.title, { name: menteeName })
            : c.titleNoName
        }
        description={fillTemplate(c.subtitle, { minutes: durationMinutes })}
      />

      <Stack spacing={{ xs: 2.5, md: 3 }} sx={{ maxWidth: 720 }}>
        <ContentCard>
          <SlotPicker
            slots={slots}
            onChange={setSlots}
            maxSlots={MAX_SLOTS}
            disabled={submitting}
          />
        </ContentCard>

        <ContentCard title={c.selectedTitle}>
          <Stack spacing={2}>
            <Typography aria-live="polite" sx={{ fontSize: "0.9rem", fontWeight: 600, color: "#6d3049" }}>
              {fillTemplate(c.selectedCount, { count: slots.length, max: MAX_SLOTS })}
            </Typography>

            <SelectedSlotList
              slots={slots}
              onRemove={(startMs) =>
                setSlots((prev) => prev.filter((s) => s.startMs !== startMs))
              }
              disabled={submitting}
            />

            {hasPast && (
              <Alert severity="warning" role="alert">
                {c.pastSelected}
              </Alert>
            )}
            {formError && (
              <Alert severity="error" role="alert">
                {formError}
              </Alert>
            )}
            {!countOk && !hasPast && (
              <Typography sx={{ fontSize: "0.85rem", color: "#6d3049" }}>
                {c.minHint}
              </Typography>
            )}

            <Stack
              direction={{ xs: "column-reverse", sm: "row" }}
              spacing={1}
              justifyContent="flex-end"
            >
              <Button
                component={RouterLink}
                to={ROUTES.APP_MENTOR_AREA}
                variant="text"
                disabled={submitting}
                sx={{ fontWeight: 700 }}
              >
                {c.cancel}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit}
                variant="contained"
                startIcon={
                  submitting ? <CircularProgress size={16} color="inherit" /> : null
                }
                sx={{ minHeight: 44, fontWeight: 700 }}
              >
                {submitting ? c.submitting : c.submit}
              </Button>
            </Stack>
          </Stack>
        </ContentCard>
      </Stack>
    </Box>
  );
}
