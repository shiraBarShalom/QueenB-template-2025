import React from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import EventBusyRoundedIcon from "@mui/icons-material/EventBusyRounded";

import { useLanguage } from "../../../i18n/LanguageProvider";
import { formatDayLabel, formatTimeRange } from "../../../utils/slotTime";
import StatusChip from "../StatusChip";
import MentorHeader from "./MentorHeader";

/**
 * A MATCHED request in the mentee's Personal Area — the Meeting card (Part 7).
 *
 * Shows the mentor, the celebratory status line, the scheduled date + time
 * (from Meeting.scheduledStart / scheduledEnd — real backend data, never a local
 * copy) and the meeting status.
 *
 * Part 14: when `request.canReschedule` (MATCHED && the single post-match
 * rescheduling has not been used), a "this time no longer works" action is
 * offered. It is confirmed by the parent's dialog and goes through the existing
 * POST /api/requests/:id/reschedule — this card never mutates state itself.
 */
const MEETING_STATUS_KEY = {
  SCHEDULED: "scheduled",
  ATTENDANCE_CONFIRMED: "scheduled",
  COMPLETED: "done",
  NOT_COMPLETED: "cancelled",
  RESCHEDULED: "neutral",
  CANCELLED: "cancelled",
};

export default function MenteeMeetingCard({
  request,
  disabled = false,
  onReschedule,
  onCannotAttend,
}) {
  const { t, lang } = useLanguage();
  const c = t.app.personalArea.scheduling.matched;
  const s = t.app.personalArea.scheduling.statuses;
  const meeting = request.meeting;

  let when = "—";
  if (meeting) {
    when = `${formatDayLabel(meeting.scheduledStart, lang)} · ${formatTimeRange(
      meeting.scheduledStart,
      meeting.scheduledEnd,
      lang
    )}`;
  }

  const statusKey = meeting
    ? MEETING_STATUS_KEY[meeting.status] || "neutral"
    : "neutral";

  return (
    <Box
      component="article"
      sx={{
        p: { xs: 2, md: 2.25 },
        borderRadius: "16px",
        border: "1px solid rgba(225,29,106,0.14)",
        backgroundColor: "#fff",
      }}
    >
      <MentorHeader
        mentor={request.mentor}
        action={
          <StatusChip
            status={statusKey}
            label={statusKey === "neutral" ? c.chipFallback : undefined}
          />
        }
      />

      <Typography sx={{ mt: 1.5, fontSize: "0.95rem", fontWeight: 700, color: "#4a1528" }}>
        {s.MATCHED}
      </Typography>

      <Typography sx={{ mt: 0.5, fontSize: "0.9rem", color: "#4a1528" }}>
        <Box component="span" sx={{ fontWeight: 700, color: "#6d3049" }}>
          {c.whenLabel}:{" "}
        </Box>
        {when}
      </Typography>

      {request.canReschedule ? (
        <Stack direction={{ xs: "column", sm: "row" }} sx={{ mt: 2 }} justifyContent="flex-end">
          <Button
            onClick={onReschedule}
            disabled={disabled}
            variant="text"
            color="error"
            startIcon={<EventBusyRoundedIcon />}
            sx={{ minHeight: 44, fontWeight: 700 }}
          >
            {c.rescheduleCta}
          </Button>
        </Stack>
      ) : (
        // MATCHED, the single post-match reschedule is spent, but she still needs
        // a way to report she cannot attend the currently scheduled meeting.
        // This does NOT reschedule — it cancels the meeting and ends the request.
        meeting &&
        meeting.status === "SCHEDULED" && (
          <Stack direction={{ xs: "column", sm: "row" }} sx={{ mt: 2 }} justifyContent="flex-end">
            <Button
              onClick={onCannotAttend}
              disabled={disabled}
              variant="text"
              color="error"
              startIcon={<EventBusyRoundedIcon />}
              sx={{ minHeight: 44, fontWeight: 700 }}
            >
              {c.cannotAttendMeetingCta}
            </Button>
          </Stack>
        )
      )}
    </Box>
  );
}
