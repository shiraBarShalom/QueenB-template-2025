import React from "react";
import { Box, Card, CardContent, Stack, Typography } from "@mui/material";

/**
 * A titled content section for the internal pages.
 *
 * Why wrap MUI <Card> instead of using it directly in pages: this pins the
 * project's radius / soft-shadow / border treatment and a consistent
 * "section title + optional action + body" pattern in one place, so the
 * four shells (and future real pages) compose sections without re-styling
 * Card each time. It is a thin wrapper, not a re-implementation.
 */
export default function ContentCard({ title, action, children, sx, contentSx }) {
  return (
    <Card
      sx={{
        borderRadius: "20px",
        border: "1px solid rgba(225,29,106,0.14)",
        boxShadow: "0 12px 34px rgba(159,18,57,0.07)",
        backgroundColor: "#ffffff",
        ...sx,
      }}
    >
      <CardContent sx={{ p: { xs: 2.5, md: 3 }, "&:last-child": { pb: { xs: 2.5, md: 3 } }, ...contentSx }}>
        {(title || action) && (
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={1.5}
            sx={{ mb: 2 }}
          >
            {title && (
              <Typography
                variant="h6"
                sx={{ fontSize: "1.05rem", fontWeight: 700, color: "#4a1528" }}
              >
                {title}
              </Typography>
            )}
            {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
          </Stack>
        )}
        {children}
      </CardContent>
    </Card>
  );
}
