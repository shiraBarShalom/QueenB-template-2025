import React from "react";
import { ButtonBase, Box, Skeleton, Typography } from "@mui/material";

import { useLanguage } from "../../../i18n/LanguageProvider";
import useCountUp from "../../../hooks/useCountUp";

/**
 * The "personal dashboard" strip at the top of the Mentor Area.
 *
 * Three counts, each derived from a SINGLE MentoringRequestStatus on the server
 * (see requestService.getMentorDashboard):
 *   scheduledMeetings        = MATCHED
 *   waitingForResponse       = WAITING_FOR_MENTOR_SLOTS
 *   awaitingMenteeSelection  = WAITING_FOR_MENTEE_SELECTION
 *
 * Each tile is also a toggle button that selects which section the page shows
 * below (`activeKey` / `onSelect`). Selected state is conveyed three ways so it
 * never depends on colour alone: `aria-pressed`, a 2px ring, and a bottom bar.
 * Numbers count up once on first load (useCountUp handles reduced-motion and
 * "don't re-animate on rerender").
 */
function StatTile({ label, value, loading, selected, onSelect, controls }) {
  const shown = useCountUp(loading ? null : value);

  return (
    <ButtonBase
      onClick={onSelect}
      disableRipple
      aria-pressed={selected}
      aria-controls={controls}
      aria-label={loading ? label : `${label}: ${value}`}
      sx={{
        display: "block",
        width: "100%",
        textAlign: "start",
        p: { xs: 2, md: 2.5 },
        borderRadius: "16px",
        backgroundColor: selected ? "rgba(225,29,106,0.06)" : "#fff",
        border: selected
          ? "2px solid #e11d6a"
          : "1px solid rgba(225,29,106,0.14)",
        boxShadow: selected
          ? "0 14px 32px rgba(159,18,57,0.12)"
          : "0 10px 28px rgba(159,18,57,0.06)",
        position: "relative",
        overflow: "hidden",
        transition: "border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease",
        "&:hover": { transform: "translateY(-1px)", borderColor: "#e11d6a" },
        "&.Mui-focusVisible": { outline: "2px solid #9f1239", outlineOffset: 2 },
        "&::after": selected
          ? {
              content: '""',
              position: "absolute",
              insetInline: 0,
              bottom: 0,
              height: 3,
              backgroundColor: "#e11d6a",
            }
          : undefined,
      }}
    >
      <Box sx={{ width: "100%" }}>
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
        <Typography
          sx={{
            mt: 0.5,
            fontSize: "0.9rem",
            fontWeight: selected ? 700 : 600,
            color: selected ? "#9f1239" : "#6d3049",
          }}
        >
          {label}
        </Typography>
      </Box>
    </ButtonBase>
  );
}

export default function DashboardSummary({
  counts,
  loading = false,
  activeKey,
  onSelect,
  panelId,
}) {
  const { t } = useLanguage();
  const d = t.app.mentorArea.dashboard;

  const tiles = [
    { key: "scheduledMeetings", label: d.scheduledMeetings },
    { key: "waitingForResponse", label: d.waitingForResponse },
    { key: "awaitingMenteeSelection", label: d.awaitingMenteeSelection },
  ];

  return (
    <Box
      role="group"
      aria-label={t.app.mentorArea.sections.groupLabel}
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
          selected={activeKey === tile.key}
          onSelect={() => onSelect(tile.key)}
          controls={panelId}
        />
      ))}
    </Box>
  );
}
