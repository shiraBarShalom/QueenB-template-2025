import React from "react";
import { Box, Typography } from "@mui/material";

import { useLanguage } from "../../../i18n/LanguageProvider";
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
 */
const CHIP_KEY = {
  WAITING_FOR_MENTOR_SLOTS: "pending",
  REJECTED: "cancelled",
  CANCELLED: "cancelled",
};

export default function MenteeRequestStatusCard({ request }) {
  const { t } = useLanguage();
  const s = t.app.personalArea.scheduling.statuses;

  const afterReschedule =
    request.status === "WAITING_FOR_MENTOR_SLOTS" && Boolean(request.previousMeeting);
  const sentenceKey = afterReschedule
    ? "WAITING_FOR_MENTOR_SLOTS_AFTER_RESCHEDULE"
    : request.status;

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
    </Box>
  );
}
