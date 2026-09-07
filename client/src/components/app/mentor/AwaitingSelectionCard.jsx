import React from "react";
import { Box, Stack, Typography } from "@mui/material";

import { useLanguage } from "../../../i18n/LanguageProvider";
import fillTemplate from "../../../utils/fillTemplate";
import { formatDayLabel, formatTimeRange } from "../../../utils/slotTime";
import StatusChip from "../StatusChip";
import MenteeIdentity from "./MenteeIdentity";

/**
 * A WAITING_FOR_MENTEE_SELECTION request in the Mentor Area.
 *
 * Informational only — the mentor has already proposed times (Part 3) and is
 * now waiting for the mentee's answer. It shows the mentee, when the times were
 * proposed, and the exact times that were offered, so it's obvious the request
 * is "in the mentee's court" and not something the mentor still owes.
 */
export default function AwaitingSelectionCard({ request }) {
  const { t, lang } = useLanguage();
  const c = t.app.mentorArea.sections.awaitingSelection;

  const proposal = request.proposal;
  const slots = proposal?.slots || [];

  let proposedAt = "—";
  if (proposal?.proposedAt) {
    try {
      proposedAt = new Date(proposal.proposedAt).toLocaleDateString(lang, {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      proposedAt = new Date(proposal.proposedAt).toISOString().slice(0, 10);
    }
  }

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
        action={<StatusChip status="neutral" label={c.chip} />}
      />

      <Typography sx={{ mt: 1.5, fontSize: "0.85rem", color: "#6d3049" }}>
        {fillTemplate(c.summary, { count: slots.length, date: proposedAt })}
      </Typography>

      {slots.length > 0 && (
        <Box sx={{ mt: 1 }}>
          <Typography
            component="h4"
            sx={{ fontSize: "0.8rem", fontWeight: 700, color: "#4a1528", mb: 0.75 }}
          >
            {c.slotsTitle}
          </Typography>
          <Stack
            component="ul"
            role="list"
            spacing={0.5}
            sx={{ listStyle: "none", p: 0, m: 0 }}
          >
            {slots.map((slot) => (
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
    </Box>
  );
}
