import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createTheme } from "@mui/material/styles";
import baseTheme from "../theme";
import { translations, LANGUAGES, DEFAULT_LANG } from "./translations";

/**
 * Single shared source of truth for the selected UI language.
 *
 * Why Context (and not local state per area): the public landing page and
 * the authenticated `/app` area are separate route trees but must stay on
 * the *same* language. Context is the one place shared, mutable UI state
 * genuinely belongs here — every consumer reads `useLanguage()` and the
 * value is computed once.
 *
 * What it provides:
 *   lang        current language code ("he" | "ar" | "en")
 *   setLang     switch language (persisted to localStorage)
 *   languages   the LANGUAGES list (code, nativeName, dir) for switchers
   *   dir         "rtl" | "ltr" for the current language
   *   locale      BCP 47 locale for dates ("he-IL" | "ar" | "en-US")
   *   t           translations[lang] — the copy dictionary
 *   fonts       { body, display } font stacks for the current language
 *   theme       MUI theme = baseTheme + direction + per-language typography
 *
 * Fonts are written onto :root so every page (landing, login, admin)
 * shares one typeface. The landing page and AppLayout still apply
 * `theme` from here as a nested ThemeProvider for direction.
 */

/*
 * Per-language font stacks, also exposed by consumers as the CSS custom
 * properties --mq-font-body / --mq-font-display so nested components that
 * don't take font props still pick up the right typeface.
 */
const FONT_STACKS = {
  he: { body: '"Heebo", "Segoe UI", sans-serif', display: '"Heebo", "Segoe UI", sans-serif' },
  ar: { body: '"Cairo", "Heebo", "Segoe UI", sans-serif', display: '"Cairo", "Heebo", sans-serif' },
  en: { body: '"Heebo", "Segoe UI", sans-serif', display: '"Heebo", "Segoe UI", sans-serif' },
};

const STORAGE_KEY = "matchqueens.lang";
const SUPPORTED = LANGUAGES.map((l) => l.code);

const LanguageContext = createContext(null);

function readStoredLang() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED.includes(stored)) return stored;
  } catch {
    /* localStorage unavailable (private mode, SSR) — fall back to default */
  }
  return DEFAULT_LANG;
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(readStoredLang);

  const setLang = (next) => {
    if (!SUPPORTED.includes(next)) return;
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore persistence failure */
    }
  };

  const dir = translations[lang]?.dir || "rtl";
  const fonts = FONT_STACKS[lang] || FONT_STACKS[DEFAULT_LANG];
  const locale = { he: "he-IL", ar: "ar", en: "en-US" }[lang] || "en-US";

  // Direction + typography theme, layered on the shared base theme.
  const theme = useMemo(
    () =>
      createTheme(baseTheme, {
        direction: dir,
        typography: {
          fontFamily: "var(--mq-font-body)",
          h1: { fontFamily: "var(--mq-font-display)", fontWeight: 800, letterSpacing: "-0.02em" },
          h2: { fontFamily: "var(--mq-font-display)", fontWeight: 800, letterSpacing: "-0.01em" },
          h3: { fontFamily: "var(--mq-font-display)", fontWeight: 700 },
          h4: { fontFamily: "var(--mq-font-display)", fontWeight: 700 },
          h5: { fontFamily: "var(--mq-font-display)", fontWeight: 700 },
          h6: { fontFamily: "var(--mq-font-display)", fontWeight: 700 },
          button: { fontFamily: "var(--mq-font-body)", fontWeight: 700 },
          body1: { fontFamily: "var(--mq-font-body)" },
          body2: { fontFamily: "var(--mq-font-body)" },
        },
      }),
    [dir]
  );

  // Keep the document font + lang in sync so landing, login, and admin share one typeface.
  useEffect(() => {
    const root = document.documentElement;
    const prevLang = root.lang;
    root.lang = lang;
    root.style.setProperty("--mq-font-body", fonts.body);
    root.style.setProperty("--mq-font-display", fonts.display);
    return () => {
      root.lang = prevLang;
    };
  }, [lang, fonts]);

  const value = useMemo(
    () => ({ lang, setLang, languages: LANGUAGES, dir, locale, t: translations[lang], fonts, theme }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang, dir, locale, fonts, theme]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within <LanguageProvider>");
  return ctx;
}

export { FONT_STACKS };
