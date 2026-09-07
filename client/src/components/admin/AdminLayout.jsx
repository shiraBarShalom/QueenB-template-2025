import React, { useMemo, useState } from "react";
import { Outlet } from "react-router-dom";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { heIL, enUS, arSA } from "@mui/material/locale";
import { Alert, Box } from "@mui/material";
import { useLanguage } from "../../i18n/LanguageProvider";
import AdminNav from "./AdminNav";

const MUI_LOCALES = { he: heIL, en: enUS, ar: arSA };

export default function AdminLayout() {
  const { dir, fonts, theme, lang } = useLanguage();
  const [bannerError, setBannerError] = useState("");
  const localizedTheme = useMemo(
    () => createTheme(theme, MUI_LOCALES[lang] || enUS),
    [theme, lang]
  );

  return (
    <ThemeProvider theme={localizedTheme}>
      <Box
        dir={dir}
        sx={{
          "--mq-font-body": fonts.body,
          "--mq-font-display": fonts.display,
          direction: dir,
          fontFamily: "var(--mq-font-body)",
          minHeight: "100vh",
          color: "#4a1528",
        }}
      >
        <AdminNav onSignOutError={setBannerError} />
        {bannerError && (
          <Alert severity="error" onClose={() => setBannerError("")} sx={{ mx: 2, mt: 2 }}>
            {bannerError}
          </Alert>
        )}
        <Outlet />
      </Box>
    </ThemeProvider>
  );
}
