import React from "react";
import { IconButton, Stack, Typography } from "@mui/material";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";

import { useLanguage } from "../../../i18n/LanguageProvider";
import fillTemplate from "../../../utils/fillTemplate";
import { formatSlotLabel, isPastStart } from "../../../utils/slotTime";

/**
 * The "Selected times" area. Each row = a checked icon + the readable label
 * ("Monday, 10:00") + a Remove button with its own accessible name. A slot that
 * has slipped into the past while the mentor was composing is flagged in text
 * (icon + words, not colour alone) so she removes it before submitting.
 */
export default function SelectedSlotList({ slots, onRemove, disabled = false }) {
  const { t, lang } = useLanguage();
  const c = t.app.mentorArea.proposeSlots;

  if (slots.length === 0) {
    return <Typography sx={{ color: "#6d3049" }}>{c.emptySelected}</Typography>;
  }

  const sorted = [...slots].sort((a, b) => a.startMs - b.startMs);

  return (
    <Stack component="ul" role="list" spacing={1} sx={{ listStyle: "none", p: 0, m: 0 }}>
      {sorted.map((slot) => {
        const label = formatSlotLabel(slot.startMs, lang);
        const past = isPastStart(slot.startMs);
        return (
          <Stack
            key={slot.startMs}
            component="li"
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={1}
            sx={{
              p: 1.25,
              borderRadius: "12px",
              border: past
                ? "1px solid rgba(217,119,6,0.5)"
                : "1px solid rgba(225,29,106,0.18)",
              backgroundColor: "#fff",
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
              {past ? (
                <WarningAmberRoundedIcon aria-hidden sx={{ color: "#9a3412", fontSize: 20 }} />
              ) : (
                <CheckCircleRoundedIcon aria-hidden sx={{ color: "#15803d", fontSize: 20 }} />
              )}
              <Typography sx={{ fontWeight: 700, color: past ? "#9a3412" : "#4a1528" }}>
                {past ? fillTemplate(c.timePast, { time: label }) : label}
              </Typography>
            </Stack>
            <IconButton
              aria-label={fillTemplate(c.removeSlot, { label })}
              onClick={() => onRemove(slot.startMs)}
              disabled={disabled}
              size="small"
              sx={{ color: "#9f1239" }}
            >
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Stack>
        );
      })}
    </Stack>
  );
}
