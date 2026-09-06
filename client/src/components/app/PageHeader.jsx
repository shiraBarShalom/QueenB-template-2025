import React from "react";
import { Box, Stack, Typography } from "@mui/material";

/**
 * Standard header for an internal page: title, optional description, and
 * an optional right-aligned action slot.
 *
 * Why a shared component (not inline per page): the four post-login pages
 * need identical title rhythm and spacing. Centralising it also gives one
 * place to add breadcrumbs / back-buttons later without touching pages.
 */
export default function PageHeader({ title, description, action }) {
  return (
    <Box sx={{ mb: { xs: 3, md: 4 } }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        alignItems={{ xs: "flex-start", sm: "center" }}
        justifyContent="space-between"
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4" sx={{ fontSize: { xs: "1.5rem", md: "1.9rem" }, color: "#4a1528" }}>
            {title}
          </Typography>
          {description && (
            <Typography sx={{ mt: 0.75, color: "#6d3049", lineHeight: 1.7, maxWidth: 620 }}>
              {description}
            </Typography>
          )}
        </Box>
        {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
      </Stack>
    </Box>
  );
}
