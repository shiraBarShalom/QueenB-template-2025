import React from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import EventBusyRoundedIcon from "@mui/icons-material/EventBusyRounded";

import { useLanguage } from "../../../i18n/LanguageProvider";
import { formatDayLabel, formatTimeRange } from "../../../utils/slotTime";
import StatusChip from "../StatusChip";
import MenteeIdentity from "./MenteeIdentity";

/**
 * A MATCHED request in the Mentor Area — the mentee picked a time and a Meeting
 * exists. Mostly informational (mentee, scheduled date/time from
 * Meeting.scheduledStart / scheduledEnd, meeting status).
 *
 * Part 14: when `request.canReschedule` (the single post-match rescheduling has
 * not been used) the mentor can say "this time no longer works for me". The
 * parent confirms and calls POST /api/requests/:id/reschedule; the request then
 * returns to "awaiting your reply" for a fresh set of times.
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

      {request.canReschedule && onReschedule ? (
        <Stack direction={{ xs: "column", sm: "row" }} sx={{ mt: 2 }} justifyContent="flex-end">
          <Button
            onClick={() => onReschedule(request)}
            disabled={busy}
            variant="text"
            color="error"
            startIcon={<EventBusyRoundedIcon />}
            sx={{ minHeight: 44, fontWeight: 700 }}
          >
            {c.rescheduleCta}
          </Button>
        </Stack>
      ) : (
        // MATCHED, the single post-match reschedule is spent, but the mentor
        // still needs a way to report she cannot attend the scheduled meeting.
        // This does NOT reschedule — it cancels the meeting and ends the request.
        !request.canReschedule &&
        onCannotAttend &&
        meeting &&
        meeting.status === "SCHEDULED" && (
          <Stack direction={{ xs: "column", sm: "row" }} sx={{ mt: 2 }} justifyContent="flex-end">
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
          </Stack>
        )
      )}
    </Box>
  );
}
