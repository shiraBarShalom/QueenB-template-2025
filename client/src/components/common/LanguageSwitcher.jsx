import React, { useState } from "react";
import { Box, Button, IconButton, Menu, MenuItem, Stack } from "@mui/material";
import LanguageRoundedIcon from "@mui/icons-material/LanguageRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import { useLanguage } from "../../i18n/LanguageProvider";

const FONT_BY_LANG = {
  he: '"Heebo", "Segoe UI", sans-serif',
  ar: '"Cairo", "Heebo", sans-serif',
  en: '"Heebo", "Segoe UI", sans-serif',
};

export default function LanguageSwitcher({ variant = "button", label, onAfterChange }) {
  const { lang, setLang, languages, dir } = useLanguage();
  const [anchor, setAnchor] = useState(null);
  const isRtl = dir === "rtl";
  const current = languages.find((item) => item.code === lang) || languages[0];

  const open = (event) => setAnchor(event.currentTarget);
  const close = () => setAnchor(null);
  const pick = (code) => {
    close();
    if (code !== lang) setLang(code);
    onAfterChange?.();
  };

  const menu = (
    <Menu
      anchorEl={anchor}
      open={Boolean(anchor)}
      onClose={close}
      anchorOrigin={{ vertical: "bottom", horizontal: isRtl ? "left" : "right" }}
      transformOrigin={{ vertical: "top", horizontal: isRtl ? "left" : "right" }}
    >
      {languages.map((item) => (
        <MenuItem
          key={item.code}
          selected={item.code === lang}
          onClick={() => pick(item.code)}
          sx={{
            direction: item.dir,
            fontFamily: FONT_BY_LANG[item.code],
            fontWeight: 600,
            fontSize: "0.95rem",
            lineHeight: 1.6,
            gap: 1.25,
            minWidth: 168,
            minHeight: 44,
            py: 1,
            justifyContent: "space-between",
          }}
        >
          {item.nativeName}
          {item.code === lang && <CheckRoundedIcon fontSize="small" sx={{ color: "#e11d6a" }} />}
        </MenuItem>
      ))}
    </Menu>
  );

  if (variant === "icon") {
    return (
      <>
        <IconButton aria-label={label} onClick={open} sx={{ color: "#9f1239" }}>
          <LanguageRoundedIcon />
        </IconButton>
        {menu}
      </>
    );
  }

  return (
    <>
      <Button
        disableRipple
        onClick={open}
        aria-label={label}
        sx={{
          minWidth: 0,
          minHeight: 40,
          px: 1.5,
          py: 0.75,
          borderRadius: 999,
          color: "#9f1239",
          overflow: "visible",
          lineHeight: 1,
          "&:hover": { backgroundColor: "rgba(225,29,106,0.07)" },
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1} sx={{ direction: "ltr" }}>
          <LanguageRoundedIcon sx={{ fontSize: 20, flexShrink: 0 }} />
          <Box
            component="span"
            sx={{
              fontFamily: FONT_BY_LANG[current.code],
              fontWeight: 700,
              fontSize: "0.95rem",
              lineHeight: 1.5,
              display: "block",
              direction: current.dir,
            }}
          >
            {current.nativeName}
          </Box>
        </Stack>
      </Button>
      {menu}
    </>
  );
}
