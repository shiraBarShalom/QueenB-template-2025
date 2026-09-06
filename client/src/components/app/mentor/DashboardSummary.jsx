import React from "react";
import { Box, Skeleton, Typography } from "@mui/material";

import { useLanguage } from "../../../i18n/LanguageProvider";
import useCountUp from "../../../hooks/useCountUp";

/**
 * The small "personal dashboard" strip at the top of the Mentor Area.
 *
 * Three counts, each one derived unambiguously from a SINGLE
 * MentoringRequestStatus on the server (see requestService.getMentorDashboard):
 *   scheduledMeetings        = MATCHED
 *   waitingForResponse       = WAITING_FOR_MENTOR_SLOTS
 *   awaitingMenteeSelection  = WAITING_FOR_MENTEE_SELECTION
 *
 * Numbers count up once on first load (useCountUp handles reduced-motion and
 * "don't re-animate on rerender"). The accessible name on each tile is the
 * final value, so screen readers never read intermediate frames.
 */
function StatTile({ label, value, loading }) {
  const shown = useCountUp(loading ? null : value);

  return (
    <Box
      role="group"
      aria-label={loading ? label : `${label}: ${value}`}
      sx={{
        p: { xs: 2, md: 2.5 },
        borderRadius: "16px",
        border: "1px solid rgba(225,29,106,0.14)",
        backgroundColor: "#fff",
        boxShadow: "0 10px 28px rgba(159,18,57,0.06)",
      }}
    >
      {loading ? (
        <Skeleton variant="text" width={48} height={44} />
      ) : (
        <Typography
          aria-hidden="true"
          sx={{
            fontSize: { xs: "1.9rem", md: "2.1rem" },
            fontWeight: 800,
            lineHeight: 1.1,
            color: "#9f1239",
          }}
        >
          {shown}
        </Typography>
      )}
      <Typography sx={{ mt: 0.5, fontSize: "0.9rem", fontWeight: 600, color: "#6d3049" }}>
        {label}
      </Typography>
    </Box>
  );
}

export default function DashboardSummary({ counts, loading = false }) {
  const { t } = useLanguage();
  const d = t.app.mentorArea.dashboard;

  const tiles = [
    { key: "scheduledMeetings", label: d.scheduledMeetings },
    { key: "waitingForResponse", label: d.waitingForResponse },
    { key: "awaitingMenteeSelection", label: d.awaitingMenteeSelection },
  ];

  return (
    <Box
      sx={{
        display: "grid",
        gap: { xs: 1.5, md: 2 },
        gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
      }}
    >
      {tiles.map((tile) => (
        <StatTile
          key={tile.key}
          label={tile.label}
          value={counts ? counts[tile.key] : 0}
          loading={loading || !counts}
        />
      ))}
    </Box>
  );
}
