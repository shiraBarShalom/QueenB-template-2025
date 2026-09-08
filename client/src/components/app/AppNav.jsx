import React, { useState } from "react";
import { NavLink, Link as RouterLink, useNavigate } from "react-router-dom";
import { Box, Button, IconButton, Stack } from "@mui/material";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";

import { ROUTES } from "../../constants/routes";
import { useLanguage } from "../../i18n/LanguageProvider";
import { useCurrentUser } from "../../auth/useCurrentUser";
import { useAuth } from "../../context/AuthContext";
import MatchQueensLogo from "../MatchQueensLogo";
import NavShell, { NavDrawer } from "../common/NavShell";
import LanguageSwitcher from "../common/LanguageSwitcher";
import NotificationBell from "./notifications/NotificationBell";

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
  const { isMentor, isAdmin } = useCurrentUser();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const nav = t.app.nav;

  // Real sign-out: destroy the server session, then drop back to the public
  // landing page. AuthContext clears `user`, which flips useCurrentUser() to a
  // guest and <RequireAuth> stops rendering the authenticated area.
  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
    } catch {
      /* even if the network call fails, fall through and leave the area */
    } finally {
      setSigningOut(false);
      setOpen(false);
      navigate(ROUTES.HOME, { replace: true });
    }
  };

  // Role-aware nav. Every flag comes from the real useCurrentUser() seam.
  const items = [
    { key: "menteeHome", label: nav.menteeHome, to: ROUTES.APP, end: true },
    { key: "personalArea", label: nav.personalArea, to: ROUTES.APP_PERSONAL_AREA },
    isMentor
      ? { key: "mentorArea", label: nav.mentorArea, to: ROUTES.APP_MENTOR_AREA }
      : { key: "becomeMentor", label: nav.becomeMentor, to: ROUTES.APP_BECOME_MENTOR, cta: true },
    isAdmin && { key: "admin", label: nav.adminDashboard, to: "/admin", end: true },
  ].filter(Boolean);

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
      onClick={handleSignOut}
      disabled={signingOut}
      startIcon={<LogoutRoundedIcon fontSize="small" />}
      sx={{
        gap: 1,
        fontFamily: "var(--mq-font-body)",
        fontWeight: 600,
        color: "#6d3049",
        "& .MuiButton-startIcon": { margin: 0 },
      }}
    >
      {nav.logout}
    </Button>
  );

  // The logo links to the public home page ("/"). Same target everywhere it
  // renders in this shared header (desktop start zone, mobile bar, drawer).
  const logo = (
    <Box
      component={RouterLink}
      to={ROUTES.HOME}
      aria-label={nav.homeAria}
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
      <NotificationBell />
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

  const mobileEnd = (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <NotificationBell />
      <LanguageSwitcher variant="icon" label={nav.language} />
    </Stack>
  );

  const drawer = (
    <NavDrawer open={open} onClose={() => setOpen(false)} dir={dir}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Box
          component={RouterLink}
          to={ROUTES.HOME}
          aria-label={nav.homeAria}
          onClick={() => setOpen(false)}
          sx={{ display: "inline-flex", alignItems: "center", p: 0, borderRadius: 2 }}
        >
          <MatchQueensLogo size={27} />
        </Box>
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
