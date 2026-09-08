import React from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import EventBusyRoundedIcon from "@mui/icons-material/EventBusyRounded";

import { useLanguage } from "../../../i18n/LanguageProvider";
import { formatDayLabel, formatTimeRange } from "../../../utils/slotTime";
import StatusChip from "../StatusChip";
import MentorHeader from "./MentorHeader";

/**
 * A read-only "here is what's happening with this request" card for the mentee's
 * Personal Area — the states she cannot act on directly:
 *   WAITING_FOR_MENTOR_SLOTS  (before any times exist, incl. after a reschedule)
 *   REJECTED                  (mentor declined)
 *   CANCELLED                 (withdrawn / mentor cancelled / no times worked)
 *
 * The raw enum is never shown. `status` comes straight from the backend
 * projection (GET /api/mentees/:id/scheduling) — there is no local status here.
 * This is the status BANNER (Part 13): it stays visible whether or not the
 * matching notification has been read.
 *
 * When `onWithdraw` is supplied AND the request is still WAITING_FOR_MENTOR_SLOTS
 * (mentor has not offered times yet), a "cancel request" button is shown. It
 * routes through the SAME existing withdraw flow the parent already uses for
 * WAITING_FOR_MENTEE_SELECTION requests (schedulingService.withdraw via
 * POST /api/requests/:id/withdraw) — no new cancellation logic.
 */
const CHIP_KEY = {
  WAITING_FOR_MENTOR_SLOTS: "pending",
  REJECTED: "cancelled",
  CANCELLED: "cancelled",
};

export default function MenteeRequestStatusCard({ request, disabled = false, onWithdraw }) {
  const { t, lang } = useLanguage();
  const s = t.app.personalArea.scheduling.statuses;
  const proposedCopy = t.app.personalArea.scheduling.proposed;

  const menteeSuggested =
    request.status === "WAITING_FOR_MENTOR_SLOTS" && Boolean(request.suggestion);
  const afterReschedule =
    request.status === "WAITING_FOR_MENTOR_SLOTS" &&
    !menteeSuggested &&
    Boolean(request.previousMeeting);
  const sentenceKey = menteeSuggested
    ? "WAITING_FOR_MENTOR_SLOTS_MENTEE_SUGGESTED"
    : afterReschedule
    ? "WAITING_FOR_MENTOR_SLOTS_AFTER_RESCHEDULE"
    : request.status;

  const suggestedSlots =
    (menteeSuggested && request.suggestion && request.suggestion.slots) || [];

  const sentence = s[sentenceKey] || s[request.status] || request.status;
  const chipLabel = (s.chip && s.chip[request.status]) || undefined;
  const chipKey = CHIP_KEY[request.status] || "neutral";

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
        action={<StatusChip status={chipKey} label={chipLabel} />}
      />
      <Typography sx={{ mt: 1.5, fontSize: "0.95rem", color: "#4a1528", lineHeight: 1.6 }}>
        {sentence}
      </Typography>

      {suggestedSlots.length > 0 && (
        <Box sx={{ mt: 1 }}>
          <Typography
            component="h4"
            sx={{ fontSize: "0.8rem", fontWeight: 700, color: "#4a1528", mb: 0.75 }}
          >
            {s.suggestedTimesTitle}
          </Typography>
          <Stack component="ul" role="list" spacing={0.5} sx={{ listStyle: "none", p: 0, m: 0 }}>
            {suggestedSlots.map((slot) => (
              <Typography
                key={slot.id}
                component="li"
                sx={{ fontSize: "0.85rem", color: "#4a1528" }}
              >
                {formatDayLabel(slot.startTime, lang)} ·{" "}
                {formatTimeRange(slot.startTime, slot.endTime, lang)}
              </Typography>
            ))}
          </Stack>
        </Box>
      )}

      {onWithdraw && request.status === "WAITING_FOR_MENTOR_SLOTS" && (
        <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1.5 }}>
          <Button
            onClick={onWithdraw}
            disabled={disabled}
            variant="text"
            color="error"
            startIcon={<EventBusyRoundedIcon />}
            sx={{ minHeight: 44, fontWeight: 700 }}
          >
            {proposedCopy.withdrawCta}
          </Button>
        </Stack>
      )}
    </Box>
  );
}
