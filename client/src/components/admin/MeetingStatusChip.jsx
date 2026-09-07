import React from "react";
import { Chip } from "@mui/material";
import { statusMeta } from "../../admin/meetingStatus";
import { useLanguage } from "../../i18n/LanguageProvider";

export default function MeetingStatusChip({ status }) {
  const { t } = useLanguage();
  const meta = statusMeta(status);
  return (
    <Chip
      size="small"
      label={t.admin.statuses[status] || meta.label}
      sx={{
        backgroundColor: meta.background,
        color: meta.color,
        fontWeight: 700,
        maxWidth: "100%",
      }}
    />
  );
}
