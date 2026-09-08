import React from "react";
import { Box, Paper, Typography } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import { useLanguage } from "../i18n/LanguageProvider";
import LanguageSwitcher from "./common/LanguageSwitcher";

export default function PageShell({
  title,
  subtitle,
  children,
  maxWidth = 720,
  showLanguage = false,
}) {
  const { dir, theme, t } = useLanguage();

  return (
    <ThemeProvider theme={theme}>
      <Box
        dir={dir}
        sx={{
          minHeight: "100vh",
          position: "relative",
          px: 2,
          py: 5,
          background: "linear-gradient(165deg, #fff0f5 0%, #fce7f3 52%, #fda4af 100%)",
        }}
      >
        {showLanguage && (
          <Box
            sx={{
              position: "absolute",
              top: 16,
              insetInlineEnd: 16,
              zIndex: 2,
            }}
          >
            <LanguageSwitcher variant="button" label={t.nav.language} />
          </Box>
        )}
        <Paper sx={{ maxWidth, mx: "auto", p: { xs: 2.5, sm: 4 } }}>
          <Typography variant="h3" component="h1" sx={{ mb: subtitle ? 1 : 3 }}>
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
    </ThemeProvider>
  );
}
