import React, { useMemo } from "react";
import { Outlet } from "react-router-dom";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { heIL, enUS, arSA } from "@mui/material/locale";
import { Box } from "@mui/material";
import { useLanguage } from "../../i18n/LanguageProvider";
import AppNav from "../app/AppNav";

const MUI_LOCALES = { he: heIL, en: enUS, ar: arSA };

/**
 * Layout route for the admin dashboard ("/admin/...").
 *
 * The admin area sits INSIDE the authenticated app, so it renders the same
 * <AppNav> as the rest of the signed-in experience (same logo → "/", same
 * Personal area / Mentor area / Admin / notifications / language / logout)
 * with the admin pages below it. It intentionally does NOT ship its own
 * top navigation.
 *
 * The only admin-specific bit here is the MUI locale (heIL / enUS / arSA)
 * layered onto the shared language theme so built-in component text
 * (TablePagination, etc.) is translated.
 */
export default function AdminLayout() {
  const { dir, fonts, theme, lang } = useLanguage();
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
        <AppNav />
        <Outlet />
      </Box>
    </ThemeProvider>
  );
}
