import React, { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Box, Button, Stack } from "@mui/material";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../i18n/LanguageProvider";
import MatchQueensLogo from "../MatchQueensLogo";
import NavShell from "../common/NavShell";
import LanguageSwitcher from "../common/LanguageSwitcher";

export default function AdminNav({ onSignOutError }) {
  const { signOut } = useAuth();
  const { t } = useLanguage();
  const [signingOut, setSigningOut] = useState(false);
  const admin = t.admin;
  const languageLabel = t.nav.language;
  const logoutLabel = t.app.nav.logout;

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } catch {
      onSignOutError?.(admin.signOutError);
      setSigningOut(false);
    }
  };

  const logo = (
    <Box
      component={RouterLink}
      to="/admin"
      aria-label={admin.brandAria}
      sx={{ display: "inline-flex", alignItems: "center", p: 0, borderRadius: 2 }}
    >
      <MatchQueensLogo size={32} />
    </Box>
  );

  const logoutButton = (
    <Button
      onClick={handleSignOut}
      disabled={signingOut}
      startIcon={<LogoutRoundedIcon fontSize="small" />}
      sx={{ fontFamily: "var(--mq-font-body)", fontWeight: 600, color: "#6d3049" }}
    >
      {logoutLabel}
    </Button>
  );

  const languageAndLogout = (
    <Stack direction="row" spacing={1} alignItems="center">
      <LanguageSwitcher variant="button" label={languageLabel} />
      {logoutButton}
    </Stack>
  );

  return (
    <NavShell
      startZone={logo}
      centerZone={null}
      endZone={languageAndLogout}
      mobileStart={logo}
      mobileEnd={
        <Stack direction="row" spacing={0.5} alignItems="center">
          <LanguageSwitcher variant="icon" label={languageLabel} />
          {logoutButton}
        </Stack>
      }
    />
  );
}
