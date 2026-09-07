import React from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import EventBusyRoundedIcon from "@mui/icons-material/EventBusyRounded";
import UpdateRoundedIcon from "@mui/icons-material/UpdateRounded";

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
 * Part 14/15: when the meeting is SCHEDULED, two independent actions may appear:
 *   - Reschedule (once) when `request.canReschedule` — POST .../reschedule
 *   - Cancel (anytime, reason required) — POST .../cannot-attend-meeting
 * This card never mutates state itself; the parent confirms and calls the APIs.
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

  const isScheduled = meeting && meeting.status === "SCHEDULED";
  const showReschedule = isScheduled && request.canReschedule && onReschedule;
  const showCancel = isScheduled && onCannotAttend;

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

      {(showReschedule || showCancel) && (
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          sx={{ mt: 2 }}
          justifyContent="flex-end"
        >
          {showReschedule && (
            <Button
              onClick={onReschedule}
              disabled={disabled}
              variant="text"
              color="primary"
              startIcon={<UpdateRoundedIcon />}
              sx={{ minHeight: 44, fontWeight: 700 }}
            >
              {c.rescheduleCta}
            </Button>
          )}
          {showCancel && (
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
          )}
        </Stack>
      )}
    </Box>
  );
}
