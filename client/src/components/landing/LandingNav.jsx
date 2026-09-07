import React from "react";
import { Box } from "@mui/material";
import { useLanguage } from "../../i18n/LanguageProvider";
import MatchQueensLogo from "../MatchQueensLogo";
import NavShell from "../common/NavShell";
import LanguageSwitcher from "../common/LanguageSwitcher";

export default function LandingNav() {
  const { t } = useLanguage();
  const nav = t.nav;

  const goHome = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const logo = (
    <Box
      component="button"
      type="button"
      onClick={goHome}
      aria-label={nav.homeAria}
      sx={{
        border: 0,
        background: "transparent",
        cursor: "pointer",
        p: 0,
        display: "flex",
        alignItems: "center",
        minWidth: 0,
        borderRadius: 2,
        "&:focus-visible": { outline: "2px solid #e11d6a", outlineOffset: 3 },
      }}
    >
      <MatchQueensLogo size={32} />
    </Box>
  );

  const language = <LanguageSwitcher variant="button" label={nav.language} />;
  const languageIcon = <LanguageSwitcher variant="icon" label={nav.language} />;

  return (
    <NavShell
      startZone={logo}
      centerZone={null}
      endZone={language}
      mobileStart={logo}
      mobileEnd={languageIcon}
    />
  );
}
