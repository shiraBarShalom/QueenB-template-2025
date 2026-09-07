import React from "react";
import { Chip } from "@mui/material";
import { statusMeta } from "../../admin/meetingStatus";

export default function MeetingStatusChip({ status }) {
  const meta = statusMeta(status);
  return (
    <Chip
      size="small"
      label={meta.label}
      sx={{
        backgroundColor: meta.background,
        color: meta.color,
        fontWeight: 700,
        maxWidth: "100%",
      }}
    />
  );
}
