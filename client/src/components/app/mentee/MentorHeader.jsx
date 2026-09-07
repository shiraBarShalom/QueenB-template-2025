import React from "react";
import { Avatar, Box, Stack, Typography } from "@mui/material";

/**
 * Mentor identity block (avatar + name + "role · workplace") for the mentee's
 * scheduling cards. Same visual language as the mentor-side MenteeIdentity so
 * both areas feel like one product. `action` renders on the trailing edge
 * (a StatusChip, usually).
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

export default function MentorHeader({ mentor = {}, action = null }) {
  const roleLine = [mentor.jobTitle, mentor.workplace].filter(Boolean).join(" · ");

  return (
    <Stack
      direction="row"
      spacing={1.5}
      alignItems="flex-start"
      justifyContent="space-between"
    >
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
        <Avatar
          sx={{
            width: 44,
            height: 44,
            bgcolor: "rgba(225,29,106,0.12)",
            color: "#9f1239",
            fontWeight: 700,
          }}
        >
          {initials(mentor.fullName)}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, color: "#4a1528" }} noWrap>
            {mentor.fullName}
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
