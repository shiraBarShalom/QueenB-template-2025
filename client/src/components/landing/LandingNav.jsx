import React, { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Box, Button, IconButton, Stack } from "@mui/material";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";

import { ROUTES } from "../../constants/routes";
import { useLanguage } from "../../i18n/LanguageProvider";
import { useAuth } from "../../context/AuthContext";
import MatchQueensLogo from "../MatchQueensLogo";
import NavShell, { NavDrawer } from "../common/NavShell";
import LanguageSwitcher from "../common/LanguageSwitcher";
import LandingUserMenu from "./LandingUserMenu";

/**
 * Public landing navbar.
 *
 * TOP navigation only — the landing-page body below is untouched.
 *   - logo  -> smooth-scrolls to the top of the same page
 *   - "About us" / "How it works" -> smooth-scroll to the existing
 *     #about / #how sections on THIS page (no separate routes)
 *   - logged out -> language switcher + a "Log in" entry point
 *   - logged in  -> language switcher + a personalized account menu
 *     ("Hi, {name}" + Personal area / Mentor area / Become a mentor /
 *      Admin dashboard / Log out), all role-filtered from useCurrentUser().
 */
function scrollToId(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

const linkButtonSx = {
  fontFamily: "var(--mq-font-body)",
  fontWeight: 600,
  fontSize: "1rem",
  color: "#6d3049",
  px: 1.5,
  borderRadius: 999,
  textTransform: "none",
  "&:hover": { color: "#9f1239", backgroundColor: "rgba(225,29,106,0.07)" },
};

const loginButtonSx = {
  px: 3,
  py: 0.9,
  fontFamily: "var(--mq-font-body)",
  fontWeight: 800,
  fontSize: "1rem",
  letterSpacing: "0.02em",
  color: "#fff",
  borderRadius: 999,
  background: "linear-gradient(180deg, #f472b6 0%, #e11d6a 100%)",
  boxShadow: "0 12px 28px rgba(225,29,106,0.32)",
  "&:hover": {
    background: "linear-gradient(180deg, #f9a8d4 0%, #e11d6a 100%)",
    boxShadow: "0 16px 34px rgba(225,29,106,0.38)",
  },
};

export default function LandingNav() {
  const { dir, t } = useLanguage();
  const { user } = useAuth();
  const nav = t.nav;
  const [open, setOpen] = useState(false);
  const authed = Boolean(user);

  const goHome = () => window.scrollTo({ top: 0, behavior: "smooth" });
  const closeDrawer = () => setOpen(false);
  const jumpTo = (id) => {
    closeDrawer();
    // let the drawer close before scrolling so the target isn't covered
    setTimeout(() => scrollToId(id), 0);
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
      <MatchQueensLogo size={30} />
    </Box>
  );

  const centerZone = (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <Button disableRipple sx={linkButtonSx} onClick={() => scrollToId("about")}>
        {nav.about}
      </Button>
      <Button disableRipple sx={linkButtonSx} onClick={() => scrollToId("how")}>
        {nav.how}
      </Button>
    </Stack>
  );

  const language = <LanguageSwitcher variant="button" label={nav.language} />;
  const languageIcon = <LanguageSwitcher variant="icon" label={nav.language} />;

  const loginButton = (
    <Button component={RouterLink} to={ROUTES.LOGIN} disableElevation sx={loginButtonSx}>
      {nav.login}
    </Button>
  );

  const endZone = (
    <Stack direction="row" spacing={1.5} alignItems="center">
      {language}
      {authed ? <LandingUserMenu variant="desktop" /> : loginButton}
    </Stack>
  );

  const mobileStart = (
    <Stack direction="row" spacing={0.5} alignItems="center">
      {logo}
      <IconButton
        aria-label={nav.openMenu}
        onClick={() => setOpen(true)}
        sx={{ color: "#9f1239" }}
      >
        <MenuRoundedIcon />
      </IconButton>
    </Stack>
  );

  const drawer = (
    <NavDrawer open={open} onClose={closeDrawer} dir={dir}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 2,
        }}
      >
        <MatchQueensLogo size={26} />
        <IconButton aria-label={nav.closeMenu} onClick={closeDrawer}>
          <CloseRoundedIcon />
        </IconButton>
      </Box>

      <Stack spacing={0.5} sx={{ mb: 2 }}>
        <Button
          onClick={() => jumpTo("about")}
          fullWidth
          sx={{ ...linkButtonSx, justifyContent: "flex-start", fontSize: "1.05rem", py: 1.2 }}
        >
          {nav.about}
        </Button>
        <Button
          onClick={() => jumpTo("how")}
          fullWidth
          sx={{ ...linkButtonSx, justifyContent: "flex-start", fontSize: "1.05rem", py: 1.2 }}
        >
          {nav.how}
        </Button>
      </Stack>

      {authed ? (
        <LandingUserMenu variant="drawer" onNavigate={closeDrawer} />
      ) : (
        <Button
          component={RouterLink}
          to={ROUTES.LOGIN}
          onClick={closeDrawer}
          fullWidth
          sx={{ ...loginButtonSx, py: 1.1 }}
        >
          {nav.login}
        </Button>
      )}
    </NavDrawer>
  );

  return (
    <NavShell
      startZone={logo}
      centerZone={centerZone}
      endZone={endZone}
      mobileStart={mobileStart}
      mobileEnd={languageIcon}
      drawer={drawer}
    />
  );
}
