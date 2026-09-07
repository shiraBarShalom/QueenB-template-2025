import React from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import EventBusyRoundedIcon from "@mui/icons-material/EventBusyRounded";
import UpdateRoundedIcon from "@mui/icons-material/UpdateRounded";

import { useLanguage } from "../../../i18n/LanguageProvider";
import { formatDayLabel, formatTimeRange } from "../../../utils/slotTime";
import StatusChip from "../StatusChip";
import MenteeIdentity from "./MenteeIdentity";

/**
 * A MATCHED request in the Mentor Area — the mentee picked a time and a Meeting
 * exists. Mostly informational (mentee, scheduled date/time from
 * Meeting.scheduledStart / scheduledEnd, meeting status).
 *
 * Part 14/15: when the meeting is SCHEDULED, two independent actions may appear:
 *   - Reschedule (once) when `request.canReschedule` — POST .../reschedule
 *   - Cancel (anytime, reason required) — POST .../cannot-attend-meeting
 */
const MEETING_STATUS_KEY = {
  SCHEDULED: "scheduled",
  ATTENDANCE_CONFIRMED: "scheduled",
  COMPLETED: "done",
  NOT_COMPLETED: "cancelled",
  RESCHEDULED: "neutral",
  CANCELLED: "cancelled",
};

export default function ScheduledMeetingCard({
  request,
  busy = false,
  onReschedule,
  onCannotAttend,
}) {
  const { t, lang } = useLanguage();
  const c = t.app.mentorArea.sections.scheduled;
  const meeting = request.meeting;

  let when = "—";
  if (meeting) {
    when = `${formatDayLabel(meeting.scheduledStart, lang)} · ${formatTimeRange(
      meeting.scheduledStart,
      meeting.scheduledEnd,
      lang
    )}`;
  }

  const statusKey = meeting ? MEETING_STATUS_KEY[meeting.status] || "neutral" : "neutral";
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
      <MenteeIdentity
        mentee={request.mentee}
        action={<StatusChip status={statusKey} />}
      />

      <Typography sx={{ mt: 1.5, fontSize: "0.9rem", color: "#4a1528" }}>
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
              onClick={() => onReschedule(request)}
              disabled={busy}
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
              onClick={() => onCannotAttend(request)}
              disabled={busy}
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
