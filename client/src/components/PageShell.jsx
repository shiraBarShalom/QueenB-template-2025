import React from "react";
import { Box, Paper, Typography } from "@mui/material";

export default function PageShell({ title, subtitle, children, maxWidth = 720 }) {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        px: 2,
        py: 5,
        background: "linear-gradient(165deg, #fff0f5 0%, #fce7f3 52%, #fda4af 100%)",
      }}
    >
      <Paper sx={{ maxWidth, mx: "auto", p: { xs: 2.5, sm: 4 } }}>
        <Typography variant="h3" component="h1" sx={{ mb: 1 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            {subtitle}
          </Typography>
        )}
        {children}
      </Paper>
    </Box>
  );
}
