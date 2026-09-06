import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import InboxRoundedIcon from "@mui/icons-material/InboxRounded";

/**
 * Empty-state block for list sections that have no items yet
 * (no search results, no requests, no meetings...).
 *
 * Why shared: the same "icon + title + hint + optional action" pattern is
 * needed by several sections across the internal pages; one component
 * keeps them consistent and is the natural place to refine the empty-state
 * visuals later.
 */
export default function EmptyState({ icon: Icon = InboxRoundedIcon, title, hint, action }) {
  return (
    <Stack
      alignItems="center"
      spacing={1.25}
      sx={{ textAlign: "center", py: { xs: 4, md: 5 }, px: 2 }}
    >
      <Box
        sx={{
          width: 52,
          height: 52,
          borderRadius: "16px",
          display: "grid",
          placeItems: "center",
          color: "#e11d6a",
          backgroundColor: "rgba(225,29,106,0.1)",
        }}
      >
        <Icon />
      </Box>
      {title && (
        <Typography sx={{ fontWeight: 700, color: "#4a1528" }}>{title}</Typography>
      )}
      {hint && (
        <Typography sx={{ color: "#6d3049", maxWidth: 420, lineHeight: 1.7 }}>{hint}</Typography>
      )}
      {action && <Box sx={{ pt: 0.5 }}>{action}</Box>}
    </Stack>
  );
}
