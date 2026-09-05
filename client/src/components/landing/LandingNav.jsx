import React, { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Box,
  Button,
  Container,
  Drawer,
  IconButton,
  Menu,
  MenuItem,
  Stack,
} from "@mui/material";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import LanguageRoundedIcon from "@mui/icons-material/LanguageRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import MatchQueensLogo from "../MatchQueensLogo";

const NAV_HEIGHT = 74;

export default function LandingNav({
  authRoute,
  onGoHome,
  onScrollTo,
  lang,
  dir,
  languages,
  onChangeLang,
  t,
}) {
  const [open, setOpen] = useState(false);
  const [langAnchor, setLangAnchor] = useState(null);
  const isRtl = dir === "rtl";
  const currentLanguage = languages.find((l) => l.code === lang) || languages[0];

  const links = [
    { label: t.home, action: () => handle(onGoHome) },
    { label: t.how, action: () => handle(() => onScrollTo("how")) },
    { label: t.about, action: () => handle(() => onScrollTo("about")) },
  ];

  function handle(fn) {
    setOpen(false);
    fn?.();
  }

  function selectLang(code) {
    setLangAnchor(null);
    setOpen(false);
    if (code !== lang) onChangeLang(code);
  }

  const linkSx = {
    fontFamily: "var(--mq-font-body)",
    fontWeight: 600,
    fontSize: "1rem",
    color: "#6d3049",
    px: 1.5,
    borderRadius: 2,
    "&:hover": { color: "#9f1239", backgroundColor: "rgba(225,29,106,0.07)" },
    "&:focus-visible": {
      outline: "2px solid #e11d6a",
      outlineOffset: 2,
    },
  };

  const langButtonSx = {
    fontFamily: "var(--mq-font-body)",
    fontWeight: 700,
    fontSize: "0.9rem",
    color: "#9f1239",
    px: 1.25,
    minWidth: 0,
    borderRadius: 2,
    "&:hover": { backgroundColor: "rgba(225,29,106,0.07)" },
  };

  const languageMenu = (
    <Menu
      anchorEl={langAnchor}
      open={Boolean(langAnchor)}
      onClose={() => setLangAnchor(null)}
      anchorOrigin={{ vertical: "bottom", horizontal: isRtl ? "left" : "right" }}
      transformOrigin={{ vertical: "top", horizontal: isRtl ? "left" : "right" }}
    >
      {languages.map((l) => (
        <MenuItem
          key={l.code}
          selected={l.code === lang}
          onClick={() => selectLang(l.code)}
          sx={{
            direction: l.dir,
            fontFamily: l.code === "ar" ? '"Cairo", sans-serif' : "var(--mq-font-body)",
            fontWeight: 600,
            gap: 1,
            minWidth: 140,
            justifyContent: "space-between",
          }}
        >
          {l.nativeName}
          {l.code === lang && <CheckRoundedIcon fontSize="small" sx={{ color: "#e11d6a" }} />}
        </MenuItem>
      ))}
    </Menu>
  );

  return (
    <Box
      component="header"
      sx={{
        position: "sticky",
        top: 0,
        zIndex: 1100,
        height: NAV_HEIGHT,
        display: "flex",
        alignItems: "center",
        backdropFilter: "blur(12px)",
        backgroundColor: "rgba(255, 251, 249, 0.82)",
        borderBottom: "1px solid rgba(225, 29, 106, 0.12)",
      }}
    >
      <Container maxWidth="lg">
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
          }}
        >
          <Box
            component="button"
            type="button"
            onClick={onGoHome}
            aria-label={t.homeAria}
            sx={{
              border: 0,
              background: "transparent",
              cursor: "pointer",
              p: 0.5,
              minWidth: 0,
              borderRadius: 2,
              "&:focus-visible": {
                outline: "2px solid #e11d6a",
                outlineOffset: 2,
              },
            }}
          >
            <MatchQueensLogo size={22} />
          </Box>

          {/* Desktop navigation */}
          <Stack
            direction="row"
            spacing={0.5}
            alignItems="center"
            sx={{ display: { xs: "none", md: "flex" } }}
          >
            {links.map((link) => (
              <Button key={link.label} disableRipple onClick={link.action} sx={linkSx}>
                {link.label}
              </Button>
            ))}
            <Button
              disableRipple
              onClick={(e) => setLangAnchor(e.currentTarget)}
              startIcon={<LanguageRoundedIcon fontSize="small" />}
              aria-label={t.language}
              sx={langButtonSx}
            >
              {currentLanguage.nativeName}
            </Button>
            <Button
              component={RouterLink}
              to={authRoute}
              variant="contained"
              disableElevation
              sx={{
                ml: 1,
                px: 3,
                fontWeight: 700,
                boxShadow: "0 10px 24px rgba(225,29,106,0.24)",
              }}
            >
              {t.login}
            </Button>
          </Stack>

          {/* Mobile trigger */}
          <Stack direction="row" spacing={0.5} sx={{ display: { xs: "flex", md: "none" } }}>
            <IconButton
              aria-label={t.language}
              onClick={(e) => setLangAnchor(e.currentTarget)}
              sx={{ color: "#9f1239" }}
            >
              <LanguageRoundedIcon />
            </IconButton>
            <IconButton aria-label={t.openMenu} onClick={() => setOpen(true)} sx={{ color: "#9f1239" }}>
              <MenuRoundedIcon />
            </IconButton>
          </Stack>
        </Box>
      </Container>

      {languageMenu}

      <Drawer
        anchor={isRtl ? "right" : "left"}
        open={open}
        onClose={() => setOpen(false)}
        PaperProps={{
          sx: {
            width: 280,
            p: 2.5,
            direction: isRtl ? "rtl" : "ltr",
            backgroundColor: "#fffdfb",
          },
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 2,
          }}
        >
          <MatchQueensLogo size={20} />
          <IconButton aria-label={t.closeMenu} onClick={() => setOpen(false)}>
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
            {t.login}
          </Button>
        </Stack>
      </Drawer>
    </Box>
  );
}

export { NAV_HEIGHT };
