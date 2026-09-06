import React from "react";
import { Chip } from "@mui/material";
import { useLanguage } from "../../i18n/LanguageProvider";

/**
 * Small status label for meetings / requests.
 *
 * Why a shared component wrapping MUI <Chip>: meeting statuses (pending,
 * scheduled, done, cancelled...) recur across the Personal area and the
 * Mentor area. Centralising the status -> {colour, translated label} map
 * keeps them visually consistent and translated from one place. Uses MUI
 * <Chip> for the base — no custom pill.
 *
 * `status` is a semantic key; the real backend statuses from
 * MATCH_QUEENS_MVP_CONTEXT.md (PENDING_MENTOR, SCHEDULED, OCCURRED, ...)
 * can be mapped onto these keys when data is wired.
 */
export const STATUS_KEYS = ["pending", "scheduled", "done", "cancelled", "neutral"];

const STYLES = {
  pending: { color: "#9a3412", bg: "rgba(217,119,6,0.14)" },
  scheduled: { color: "#9f1239", bg: "rgba(225,29,106,0.12)" },
  done: { color: "#166534", bg: "rgba(21,128,61,0.14)" },
  cancelled: { color: "#7f1d1d", bg: "rgba(220,38,38,0.12)" },
  neutral: { color: "#6d3049", bg: "rgba(109,48,73,0.10)" },
};

export default function StatusChip({ status = "neutral", label, size = "small" }) {
  const { t } = useLanguage();
  const key = STATUS_KEYS.includes(status) ? status : "neutral";
  const s = STYLES[key];
  const text = label || t.app.common.status[key];

  return (
    <Chip
      label={text}
      size={size}
      sx={{
        fontFamily: "var(--mq-font-body)",
        fontWeight: 700,
        color: s.color,
        backgroundColor: s.bg,
        border: "none",
      }}
    />
  );
}
