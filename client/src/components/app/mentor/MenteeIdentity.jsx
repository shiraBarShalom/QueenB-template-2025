import React from "react";
import { Avatar, Box, Stack, Typography } from "@mui/material";

import { useLanguage } from "../../../i18n/LanguageProvider";
import fillTemplate from "../../../utils/fillTemplate";

/**
 * Shared mentee header (avatar + name + "role · workplace") for the mentor
 * dashboard section cards. Kept identical to the visual language of
 * IncomingRequestCard so the three sections feel like one surface.
 * `action` renders on the trailing edge (a StatusChip, usually).
 */
function initials(name) {
  if (!name) return "";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function MenteeIdentity({ mentee = {}, action = null }) {
  const { t } = useLanguage();
  const roleLine = [mentee.jobTitle, mentee.workplace].filter(Boolean).join(" · ");

  return (
    <Stack
      direction="row"
      spacing={1.5}
      alignItems="flex-start"
      justifyContent="space-between"
    >
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
        <Avatar
          src={mentee.profileImageUrl || undefined}
          alt={fillTemplate(t.app.mentorArea.incoming.avatarAlt, {
            name: mentee.fullName || "",
          })}
          sx={{
            width: 44,
            height: 44,
            bgcolor: "rgba(225,29,106,0.12)",
            color: "#9f1239",
            fontWeight: 700,
          }}
        >
          {initials(mentee.fullName)}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, color: "#4a1528" }} noWrap>
            {mentee.fullName}
          </Typography>
          {roleLine && (
            <Typography sx={{ fontSize: "0.85rem", color: "#6d3049" }} noWrap>
              {roleLine}
            </Typography>
          )}
        </Box>
      </Stack>
      {action}
    </Stack>
  );
}
