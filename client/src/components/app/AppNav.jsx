import React, { useState } from "react";
import { NavLink, Link as RouterLink } from "react-router-dom";
import { Box, Button, IconButton, Stack } from "@mui/material";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";

import { ROUTES } from "../../constants/routes";
import { useLanguage } from "../../i18n/LanguageProvider";
import { useCurrentUser } from "../../auth/useCurrentUser";
import MatchQueensLogo from "../MatchQueensLogo";
import NavShell, { NavDrawer } from "../common/NavShell";
import LanguageSwitcher from "../common/LanguageSwitcher";

/**
 * Authenticated navbar. Same shell/style as the public LandingNav so the
 * two areas feel like one product.
 *
 * Three-zone layout (see NavShell):
 *   startZone  = Match Queen logo   (RTL: far right, LTR: far left)
 *   centerZone = nav links          (centred)
 *   endZone    = language switcher + logout  (opposite edge to the logo)
 *
 * The item list is DATA-DRIVEN and filtered by useCurrentUser():
 *   - "Personal area"      always (a logged-in user)
 *   - "Mentor area"        only when isMentor
 *   - "Become a mentor"    only when !isMentor  (shown as a CTA button)
 * Wiring real role data later = implementing useCurrentUser(); this
 * component does not change.
 */
export default function AppNav() {
  const { dir, t } = useLanguage();
  const { isMentor } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const nav = t.app.nav;

  // TODO(role-redirect): the item list is the seam for role-aware nav.
  const items = [
    { key: "menteeHome", label: nav.menteeHome, to: ROUTES.APP, end: true },
    { key: "personalArea", label: nav.personalArea, to: ROUTES.APP_PERSONAL_AREA },
    isMentor
      ? { key: "mentorArea", label: nav.mentorArea, to: ROUTES.APP_MENTOR_AREA }
      : { key: "becomeMentor", label: nav.becomeMentor, to: ROUTES.APP_BECOME_MENTOR, cta: true },
  ];

  const linkSx = ({ isActive }) => ({
    fontFamily: "var(--mq-font-body)",
    fontWeight: 600,
    fontSize: "1rem",
    textDecoration: "none",
    color: isActive ? "#9f1239" : "#6d3049",
    backgroundColor: isActive ? "rgba(225,29,106,0.09)" : "transparent",
    padding: "6px 12px",
    borderRadius: 8,
    whiteSpace: "nowrap",
  });

  const desktopItems = items.map((item) =>
    item.cta ? (
      <Button
        key={item.key}
        component={RouterLink}
        to={item.to}
        variant="outlined"
        size="small"
        sx={{ fontWeight: 700, whiteSpace: "nowrap" }}
      >
        {item.label}
      </Button>
    ) : (
      <NavLink key={item.key} to={item.to} end={item.end} style={linkSx}>
        {item.label}
      </NavLink>
    )
  );

  const logoutButton = (
    <Button
      // TODO(auth): wire to real sign-out. Placeholder — no session yet.
      disabled
      startIcon={<LogoutRoundedIcon fontSize="small" />}
      sx={{ fontFamily: "var(--mq-font-body)", fontWeight: 600, color: "#6d3049" }}
    >
      {nav.logout}
    </Button>
  );

  const logo = (
    <Box
      component={RouterLink}
      to={ROUTES.APP}
      aria-label={nav.brandAria}
      sx={{ display: "inline-flex", alignItems: "center", p: 0, borderRadius: 2 }}
    >
      <MatchQueensLogo size={32} />
    </Box>
  );

  const centerZone = (
    <Stack direction="row" spacing={1} alignItems="center">
      {desktopItems}
    </Stack>
  );

  const endZone = (
    <Stack direction="row" spacing={1} alignItems="center">
      <LanguageSwitcher variant="button" label={nav.language} />
      {logoutButton}
    </Stack>
  );

  const mobileStart = (
    <Stack direction="row" spacing={0.5} alignItems="center">
      {logo}
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
        {items.map((item) => (
          <Button
            key={item.key}
            component={NavLink}
            to={item.to}
            end={item.end}
            onClick={() => setOpen(false)}
            fullWidth
            sx={{
              justifyContent: "flex-start",
              fontFamily: "var(--mq-font-body)",
              fontWeight: 600,
              fontSize: "1.05rem",
              color: "#4a1528",
              py: 1.2,
              "&.active": { color: "#9f1239", backgroundColor: "rgba(225,29,106,0.09)" },
            }}
          >
            {item.label}
          </Button>
        ))}
        <Box sx={{ pt: 1 }}>{logoutButton}</Box>
      </Stack>
    </NavDrawer>
  );

  return (
    <NavShell
      startZone={logo}
      centerZone={centerZone}
      endZone={endZone}
      mobileStart={mobileStart}
      mobileEnd={mobileEnd}
      drawer={drawer}
    />
  );
}
