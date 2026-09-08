import React, { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  Typography,
} from "@mui/material";

import { useLanguage } from "../../../i18n/LanguageProvider";
import fillTemplate from "../../../utils/fillTemplate";
import { isPastStart, toPayloadSlot } from "../../../utils/slotTime";
import SlotPicker from "../mentor/SlotPicker";
import SelectedSlotList from "../mentor/SelectedSlotList";

/**
 * "None of these work" → the mentee suggests her OWN times instead of only
 * asking the mentor to try again.
 *
 * She picks 1–3 future start times (same picker the mentor uses in Part 3); each
 * becomes { startTime, endTime } with endTime = start + the mentor's configured
 * meeting length. Submitting calls schedulingService.suggestSlots via the
 * parent; the backend stays the single authority for the
 * WAITING_FOR_MENTEE_SELECTION → WAITING_FOR_MENTOR_SLOTS transition and the
 * SchedulingRound / OfferedSlot writes. This dialog only mirrors the count /
 * future-time rules for UX.
 *
 * `onFallback` keeps the original path available: ask the mentor for a fresh
 * round of times (CANNOT_ATTEND) without suggesting any.
 */
const MIN_SLOTS = 1;
const MAX_SLOTS = 3;

export default function SuggestTimesDialog({
  open = false,
  request,
  pending = false,
  onSubmit,
  onFallback,
  onCancel,
}) {
  const { t, dir } = useLanguage();
  const c = t.app.personalArea.scheduling.suggest;

  const [slots, setSlots] = useState([]);

  const durationMinutes = request?.mentor?.meetingDurationMinutes;
  const hasPast = useMemo(() => slots.some((s) => isPastStart(s.startMs)), [slots]);
  const countOk = slots.length >= MIN_SLOTS && slots.length <= MAX_SLOTS;
  const canSubmit =
    Number.isFinite(durationMinutes) &&
    durationMinutes > 0 &&
    countOk &&
    !hasPast &&
    !pending;

  // Reset the picker whenever the dialog is (re)opened for a request.
  const requestId = request?.id;
  React.useEffect(() => {
    if (open) setSlots([]);
  }, [open, requestId]);

  const handleSubmit = () => {
    if (!canSubmit) return;
    const payload = [...slots]
      .sort((a, b) => a.startMs - b.startMs)
      .map((s) => toPayloadSlot(s.startMs, durationMinutes));
    onSubmit(payload);
  };

  return (
    <Dialog
      open={open}
      onClose={pending ? undefined : onCancel}
      dir={dir}
      fullWidth
      maxWidth="sm"
      aria-labelledby="mentee-suggest-title"
      PaperProps={{ sx: { borderRadius: "18px", p: 1 } }}
    >
      <DialogTitle id="mentee-suggest-title" sx={{ fontWeight: 800, color: "#4a1528" }}>
        {c.title}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography sx={{ color: "#6d3049", lineHeight: 1.7 }}>{c.intro}</Typography>
          {Number.isFinite(durationMinutes) && durationMinutes > 0 && (
            <Typography sx={{ fontSize: "0.85rem", color: "#6d3049" }}>
              {fillTemplate(c.durationNote, { minutes: durationMinutes })}
            </Typography>
          )}

          <SlotPicker
            slots={slots}
            onChange={setSlots}
            maxSlots={MAX_SLOTS}
            disabled={pending}
            durationMinutes={durationMinutes}
          />

          <Box>
            <Typography
              sx={{ fontSize: "0.85rem", fontWeight: 700, color: "#4a1528", mb: 1 }}
            >
              {c.selectedTitle}
            </Typography>
            <SelectedSlotList
              slots={slots}
              onRemove={(startMs) =>
                setSlots((prev) => prev.filter((s) => s.startMs !== startMs))
              }
              disabled={pending}
            />
          </Box>

          {hasPast && (
            <Alert severity="warning" role="alert">
              {t.app.mentorArea.proposeSlots.pastSelected}
            </Alert>
          )}
          {!countOk && !hasPast && (
            <Typography sx={{ fontSize: "0.85rem", color: "#6d3049" }}>
              {c.minHint}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, flexWrap: "wrap", gap: 1 }}>
        <Button onClick={onCancel} disabled={pending} sx={{ fontWeight: 700 }}>
          {c.cancel}
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          onClick={handleSubmit}
          disabled={!canSubmit}
          variant="contained"
          startIcon={pending ? <CircularProgress size={16} color="inherit" /> : null}
          sx={{ fontWeight: 700 }}
        >
          {pending ? c.submitting : c.submit}
        </Button>
      </DialogActions>
      <Divider sx={{ mx: 3 }} />
      <Box sx={{ px: 3, py: 1.5 }}>
        <Typography sx={{ fontSize: "0.8rem", color: "#6d3049", mb: 0.5 }}>
          {c.fallbackHint}
        </Typography>
        <Button
          onClick={onFallback}
          disabled={pending}
          variant="text"
          sx={{ fontWeight: 700, px: 0 }}
        >
          {c.fallbackCta}
        </Button>
      </Box>
    </Dialog>
  );
}
