import React, { useState } from "react";
import { Button, IconButton, Menu, MenuItem } from "@mui/material";
import LanguageRoundedIcon from "@mui/icons-material/LanguageRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import { useLanguage } from "../../i18n/LanguageProvider";

/**
 * Shared language switcher (globe button + menu of languages), used by
 * BOTH the public and the authenticated navbars.
 *
 * Why shared: the switcher markup + the RTL-aware menu anchoring +
 * the per-language font in the menu are non-trivial and were duplicated
 * once already. One component keeps the two navbars in sync and reads
 * the single shared language state via `useLanguage()`.
 *
 * Props:
 *   variant   "button" (globe + current language name, for desktop)
 *           | "icon"   (globe only, for the mobile bar)
 *   label     accessible label (already translated by the caller)
 */
export default function LanguageSwitcher({ variant = "button", label, onAfterChange }) {
  const { lang, setLang, languages, dir } = useLanguage();
  const [anchor, setAnchor] = useState(null);
  const isRtl = dir === "rtl";
  const current = languages.find((l) => l.code === lang) || languages[0];

  const open = (e) => setAnchor(e.currentTarget);
  const close = () => setAnchor(null);
  const pick = (code) => {
    close();
    if (code !== lang) setLang(code);
    onAfterChange?.();
  };

  return (
    <>
      {variant === "icon" ? (
        <IconButton aria-label={label} onClick={open} sx={{ color: "#9f1239" }}>
          <LanguageRoundedIcon />
        </IconButton>
      ) : (
        <Button
          disableRipple
          onClick={open}
          startIcon={<LanguageRoundedIcon fontSize="small" />}
          aria-label={label}
          sx={{
            fontFamily: "var(--mq-font-body)",
            fontWeight: 700,
            fontSize: "0.9rem",
            color: "#9f1239",
            px: 1.25,
            minWidth: 0,
            borderRadius: 2,
            "&:hover": { backgroundColor: "rgba(225,29,106,0.07)" },
          }}
        >
          {current.nativeName}
        </Button>
      )}

      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={close}
        anchorOrigin={{ vertical: "bottom", horizontal: isRtl ? "left" : "right" }}
        transformOrigin={{ vertical: "top", horizontal: isRtl ? "left" : "right" }}
      >
        {languages.map((l) => (
          <MenuItem
            key={l.code}
            selected={l.code === lang}
            onClick={() => pick(l.code)}
            sx={{
              direction: l.dir,
              fontFamily: l.code === "ar" ? '"Cairo", sans-serif' : "var(--mq-font-body)",
              fontWeight: 600,
              gap: 1,
              minWidth: 150,
              justifyContent: "space-between",
            }}
          >
            {l.nativeName}
            {l.code === lang && <CheckRoundedIcon fontSize="small" sx={{ color: "#e11d6a" }} />}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
