import React, { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Box, Button, IconButton, Stack } from "@mui/material";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";

import { useLanguage } from "../../i18n/LanguageProvider";
import MatchQueensLogo from "../MatchQueensLogo";
import NavShell, { NavDrawer } from "../common/NavShell";
import LanguageSwitcher from "../common/LanguageSwitcher";

/**
 * Public landing navbar. Built on the shared <NavShell> three-zone layout:
 *   startZone  = Match Queen logo   (RTL: far right, LTR: far left)
 *   centerZone = nav links          (centred)
 *   endZone    = language switcher + login  (opposite edge to the logo)
 */
export default function LandingNav({ authRoute, onGoHome, onScrollTo }) {
  const { dir, t } = useLanguage();
  const nav = t.nav;
  const [open, setOpen] = useState(false);

  const links = [
    { label: nav.home, action: () => handle(onGoHome) },
    { label: nav.how, action: () => handle(() => onScrollTo("how")) },
    { label: nav.about, action: () => handle(() => onScrollTo("about")) },
  ];

  function handle(fn) {
    setOpen(false);
    fn?.();
  }

  const linkSx = {
    fontFamily: "var(--mq-font-body)",
    fontWeight: 600,
    fontSize: "1rem",
    color: "#6d3049",
    px: 1.5,
    borderRadius: 2,
    "&:hover": { color: "#9f1239", backgroundColor: "rgba(225,29,106,0.07)" },
    "&:focus-visible": { outline: "2px solid #e11d6a", outlineOffset: 2 },
  };

  const logoButton = (
    <Box
      component="button"
      type="button"
      onClick={onGoHome}
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

  const centerZone = (
    <Stack direction="row" spacing={0.5} alignItems="center">
      {links.map((link) => (
        <Button key={link.label} disableRipple onClick={link.action} sx={linkSx}>
          {link.label}
        </Button>
      ))}
    </Stack>
  );

  const endZone = (
    <Stack direction="row" spacing={1} alignItems="center">
      <LanguageSwitcher variant="button" label={nav.language} />
      <Button
        component={RouterLink}
        to={authRoute}
        variant="contained"
        disableElevation
        sx={{
          px: 3,
          fontWeight: 700,
          boxShadow: "0 10px 24px rgba(225,29,106,0.24)",
        }}
      >
        {nav.login}
      </Button>
    </Stack>
  );

  const mobileStart = (
    <Stack direction="row" spacing={0.5} alignItems="center">
      {logoButton}
      <IconButton aria-label={nav.openMenu} onClick={() => setOpen(true)} sx={{ color: "#9f1239" }}>
        <MenuRoundedIcon />
      </IconButton>
    </Stack>
  );

  const mobileEnd = <LanguageSwitcher variant="icon" label={nav.language} />;

  const drawer = (
    <NavDrawer open={open} onClose={() => setOpen(false)} dir={dir}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <MatchQueensLogo size={27} />
        <IconButton aria-label={nav.closeMenu} onClick={() => setOpen(false)}>
          <CloseRoundedIcon />
        </IconButton>
      </Box>
      <Stack spacing={0.5}>
        {links.map((link) => (
          <Button
            key={link.label}
            onClick={link.action}
            fullWidth
            sx={{
              justifyContent: "flex-start",
              fontFamily: "var(--mq-font-body)",
              fontWeight: 600,
              fontSize: "1.05rem",
              color: "#4a1528",
              py: 1.2,
            }}
          >
            {link.label}
          </Button>
        ))}
        <Button
          component={RouterLink}
          to={authRoute}
          variant="contained"
          fullWidth
          onClick={() => setOpen(false)}
          sx={{ mt: 1.5, py: 1.2, fontWeight: 700 }}
        >
          {nav.login}
        </Button>
      </Stack>
    </NavDrawer>
  );

  return (
    <NavShell
      startZone={logoButton}
      centerZone={centerZone}
      endZone={endZone}
      mobileStart={mobileStart}
      mobileEnd={mobileEnd}
      drawer={drawer}
    />
  );
}
