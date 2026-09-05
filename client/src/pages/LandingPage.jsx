import React, { useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { Box, Button, Container, Stack, Typography } from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import PersonSearchRoundedIcon from "@mui/icons-material/PersonSearchRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import Diversity3RoundedIcon from "@mui/icons-material/Diversity3Rounded";

import baseTheme from "../theme";
import { ROUTES } from "../constants/routes";
import { translations, LANGUAGES, DEFAULT_LANG } from "../i18n/translations";
import MatchQueensLogo from "../components/MatchQueensLogo";
import LandingNav, { NAV_HEIGHT } from "../components/landing/LandingNav";
import HeroArt from "../components/landing/HeroArt";
import Reveal from "../components/landing/Reveal";

const AUTH_ROUTE = ROUTES.LOGIN;

/*
 * Per-language font stacks, exposed as CSS custom properties on the page
 * wrapper so every nested component (including HeroArt/LandingNav, which
 * don't take font props) picks up the right typeface automatically —
 * adding a language later only means adding a stack here.
 */
const FONT_STACKS = {
  he: { body: '"Heebo", "Segoe UI", sans-serif', display: '"Rubik", "Heebo", sans-serif' },
  ar: { body: '"Cairo", "Heebo", "Segoe UI", sans-serif', display: '"Cairo", "Rubik", sans-serif' },
  en: { body: '"Heebo", "Segoe UI", sans-serif', display: '"Rubik", "Heebo", sans-serif' },
};

const HEBREW_FONTS = "var(--mq-font-body)";
const DISPLAY_FONTS = "var(--mq-font-display)";

const STEP_ICONS = [PersonSearchRoundedIcon, EventAvailableRoundedIcon, Diversity3RoundedIcon];

const scrollToId = (id) => {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
};

const goToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

const sectionAnchor = { scrollMarginTop: `${NAV_HEIGHT + 12}px` };

const kickerSx = {
  fontFamily: DISPLAY_FONTS,
  fontWeight: 700,
  fontSize: "0.85rem",
  letterSpacing: "0.08em",
  color: "#e11d6a",
};

const accentRule = (
  <Box
    aria-hidden="true"
    sx={{ width: 56, height: 4, borderRadius: 999, background: "linear-gradient(90deg,#e11d6a,#f472b6)" }}
  />
);

function StepCard({ index, icon: Icon, title, text }) {
  return (
    <Box
      sx={{
        position: "relative",
        zIndex: 1,
        backgroundColor: "#ffffff",
        border: "1px solid rgba(225,29,106,0.14)",
        borderRadius: 4,
        p: { xs: 3, md: 3.5 },
        boxShadow: "0 12px 34px rgba(159,18,57,0.08)",
        transition: "transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease",
        "&:hover": {
          transform: "translateY(-6px)",
          boxShadow: "0 22px 48px rgba(159,18,57,0.16)",
          borderColor: "rgba(225,29,106,0.4)",
        },
      }}
    >
      <Box
        sx={{
          fontFamily: '"Fira Code", ui-monospace, monospace',
          fontWeight: 600,
          fontSize: "1.05rem",
          color: "rgba(225,29,106,0.4)",
        }}
      >
        {String(index + 1).padStart(2, "0")}
      </Box>
      <Box
        sx={{
          mt: 1.5,
          width: 52,
          height: 52,
          borderRadius: 3,
          display: "grid",
          placeItems: "center",
          color: "#e11d6a",
          backgroundColor: "rgba(225,29,106,0.1)",
        }}
      >
        <Icon />
      </Box>
      <Typography variant="h3" sx={{ mt: 2, fontSize: "1.18rem" }}>
        {title}
      </Typography>
      <Typography sx={{ mt: 1, color: "#6d3049", lineHeight: 1.75 }}>{text}</Typography>
    </Box>
  );
}

function Badge({ children }) {
  return (
    <Box
      sx={{
        px: 1.75,
        py: 0.7,
        borderRadius: 999,
        fontFamily: HEBREW_FONTS,
        fontWeight: 700,
        fontSize: "0.85rem",
        color: "#9f1239",
        backgroundColor: "rgba(225,29,106,0.08)",
        border: "1px solid rgba(225,29,106,0.16)",
      }}
    >
      {children}
    </Box>
  );
}

export default function LandingPage() {
  const year = new Date().getFullYear();
  const [lang, setLang] = useState(DEFAULT_LANG);
  const t = translations[lang];
  const dir = t.dir;
  const isRtl = dir === "rtl";
  const fonts = FONT_STACKS[lang] || FONT_STACKS[DEFAULT_LANG];
  const ArrowIcon = isRtl ? ArrowBackRoundedIcon : ArrowForwardRoundedIcon;

  /* RTL/LTR + per-language typography, layered on top of the shared app theme. */
  const landingTheme = useMemo(
    () =>
      createTheme(baseTheme, {
        direction: dir,
        typography: {
          fontFamily: HEBREW_FONTS,
          h1: { fontFamily: DISPLAY_FONTS, fontWeight: 800, letterSpacing: "-0.02em" },
          h2: { fontFamily: DISPLAY_FONTS, fontWeight: 800, letterSpacing: "-0.01em" },
          h3: { fontFamily: DISPLAY_FONTS, fontWeight: 700 },
          h4: { fontFamily: DISPLAY_FONTS, fontWeight: 700 },
          h5: { fontFamily: DISPLAY_FONTS, fontWeight: 700 },
          h6: { fontFamily: DISPLAY_FONTS, fontWeight: 700 },
          button: { fontFamily: HEBREW_FONTS, fontWeight: 700 },
          body1: { fontFamily: HEBREW_FONTS },
          body2: { fontFamily: HEBREW_FONTS },
        },
      }),
    [dir]
  );

  const steps = t.how.steps.map((s, i) => ({ ...s, icon: STEP_ICONS[i] }));

  return (
    <ThemeProvider theme={landingTheme}>
      <Box
        dir={dir}
        sx={{
          "--mq-font-body": fonts.body,
          "--mq-font-display": fonts.display,
          direction: dir,
          fontFamily: "var(--mq-font-body)",
          color: "#4a1528",
          backgroundColor: "#fffdfb",
          overflowX: "hidden",
        }}
      >
        <LandingNav
          authRoute={AUTH_ROUTE}
          onGoHome={goToTop}
          onScrollTo={scrollToId}
          lang={lang}
          dir={dir}
          languages={LANGUAGES}
          onChangeLang={setLang}
          t={t.nav}
        />

        {/* ---------------- HERO ---------------- */}
        <Box
          component="section"
          aria-labelledby="hero-title"
          sx={{
            position: "relative",
            overflow: "hidden",
            backgroundColor: "#fffdfb",
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(190,24,93,0.09) 1px, transparent 0)",
            backgroundSize: "26px 26px",
          }}
        >
          <Box
            aria-hidden="true"
            sx={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background:
                "radial-gradient(60% 55% at 88% 8%, rgba(244,114,182,0.28), transparent 60%), radial-gradient(55% 50% at 6% 92%, rgba(251,113,133,0.22), transparent 60%)",
            }}
          />
          <Box
            aria-hidden="true"
            sx={{
              position: "absolute",
              top: { xs: -40, md: -30 },
              left: { xs: -20, md: 40 },
              fontFamily: '"Fira Code", monospace',
              fontSize: { xs: 180, md: 300 },
              fontWeight: 700,
              lineHeight: 1,
              color: "rgba(225,29,106,0.05)",
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            {"{ }"}
          </Box>

          <Container maxWidth="lg" sx={{ position: "relative", py: { xs: 6, md: 10 } }}>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "1.05fr 0.95fr" },
                gap: { xs: 6, md: 4 },
                alignItems: "center",
              }}
            >
              <Box sx={{ minWidth: 0, animation: "mentorMeFadeUp 700ms ease-out both" }}>
                <Box
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 1,
                    px: 1.75,
                    py: 0.7,
                    mb: 2.5,
                    borderRadius: 999,
                    backgroundColor: "rgba(225,29,106,0.08)",
                    border: "1px solid rgba(225,29,106,0.16)",
                  }}
                >
                  <Box component="span" sx={{ color: "#c9a24b", fontSize: "0.9rem" }}>
                    ✦
                  </Box>
                  <Box
                    component="span"
                    sx={{ fontFamily: HEBREW_FONTS, fontWeight: 700, fontSize: "0.85rem", color: "#9f1239" }}
                  >
                    {t.hero.eyebrow}
                  </Box>
                </Box>

                <Typography
                  id="hero-title"
                  variant="h1"
                  sx={{
                    fontSize: { xs: "2.1rem", sm: "2.7rem", md: "3.1rem" },
                    lineHeight: 1.25,
                    color: "#4a1528",
                  }}
                >
                  {t.hero.titleBefore}
                  <Box component="span" sx={{ color: "#e11d6a" }}>
                    {t.hero.titleHighlight}
                  </Box>
                  {t.hero.titleAfter}
                </Typography>

                <Typography
                  sx={{
                    mt: 2.5,
                    maxWidth: 520,
                    fontSize: { xs: "1.02rem", md: "1.15rem" },
                    lineHeight: 1.8,
                    color: "#6d3049",
                  }}
                >
                  {t.hero.subtitle}
                </Typography>

                <Stack direction="row" spacing={1.5} sx={{ mt: 4, flexWrap: "wrap", gap: 1.5 }}>
                  <Button
                    component={RouterLink}
                    to={AUTH_ROUTE}
                    variant="contained"
                    size="large"
                    endIcon={<ArrowIcon />}
                    sx={{ px: 3.5, py: 1.25, fontWeight: 800, boxShadow: "0 14px 30px rgba(225,29,106,0.28)" }}
                  >
                    {t.hero.ctaPrimary}
                  </Button>
                  <Button
                    variant="outlined"
                    size="large"
                    onClick={() => scrollToId("how")}
                    sx={{ px: 3.5, py: 1.25, fontWeight: 700 }}
                  >
                    {t.hero.ctaSecondary}
                  </Button>
                </Stack>
              </Box>

              <Box
                sx={{
                  minWidth: 0,
                  animation: "mentorMeFadeUp 800ms ease-out 120ms both",
                  order: { xs: -1, md: 0 },
                }}
              >
                <HeroArt labels={t.art} />
              </Box>
            </Box>
          </Container>
        </Box>

        {/* ---------------- HOW IT WORKS ---------------- */}
        <Box
          component="section"
          id="how"
          aria-labelledby="how-title"
          sx={{
            ...sectionAnchor,
            py: { xs: 7, md: 11 },
            background: "linear-gradient(180deg,#fff6f9,#fffdfb)",
          }}
        >
          <Container maxWidth="lg">
            <Reveal>
              <Stack spacing={1.5} alignItems="center" sx={{ textAlign: "center" }}>
                <Box sx={kickerSx}>{t.how.kicker}</Box>
                <Typography id="how-title" variant="h2" sx={{ fontSize: { xs: "1.8rem", md: "2.4rem" } }}>
                  {t.how.title}
                </Typography>
                {accentRule}
                <Typography sx={{ mt: 1, maxWidth: 520, color: "#6d3049", lineHeight: 1.75 }}>
                  {t.how.subtitle}
                </Typography>
              </Stack>
            </Reveal>

            <Box sx={{ position: "relative", mt: { xs: 5, md: 7 } }}>
              <Box
                aria-hidden="true"
                sx={{
                  display: { xs: "none", md: "block" },
                  position: "absolute",
                  top: 118,
                  left: "16%",
                  right: "16%",
                  borderTop: "2px dashed rgba(225,29,106,0.28)",
                  zIndex: 0,
                }}
              />
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
                  gap: { xs: 3, md: 3.5 },
                }}
              >
                {steps.map((step, i) => (
                  <Reveal key={step.title} delay={i * 90}>
                    <StepCard index={i} icon={step.icon} title={step.title} text={step.text} />
                  </Reveal>
                ))}
              </Box>
            </Box>
          </Container>
        </Box>

        {/* ---------------- ABOUT ---------------- */}
        <Box
          component="section"
          id="about"
          aria-labelledby="about-title"
          sx={{ ...sectionAnchor, py: { xs: 7, md: 11 }, backgroundColor: "#fffdfb" }}
        >
          <Container maxWidth="lg">
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "1fr 0.8fr" },
                gap: { xs: 5, md: 8 },
                alignItems: "center",
              }}
            >
              <Reveal sx={{ minWidth: 0 }}>
                <Stack spacing={1.5} alignItems="flex-start">
                  <Box sx={kickerSx}>{t.about.kicker}</Box>
                  <Typography id="about-title" variant="h2" sx={{ fontSize: { xs: "1.8rem", md: "2.4rem" } }}>
                    {t.about.title}
                  </Typography>
                  {accentRule}
                  <Typography
                    sx={{ mt: 2, maxWidth: 560, fontSize: "1.08rem", lineHeight: 1.85, color: "#6d3049" }}
                  >
                    {t.about.text}
                  </Typography>
                  <Stack direction="row" spacing={1.25} sx={{ mt: 2, flexWrap: "wrap", gap: 1.25 }}>
                    {t.about.badges.map((b) => (
                      <Badge key={b}>{b}</Badge>
                    ))}
                  </Stack>
                </Stack>
              </Reveal>

              <Reveal delay={120}>
                <Box
                  aria-hidden="true"
                  sx={{
                    fontFamily: '"Fira Code", ui-monospace, monospace',
                    textAlign: "center",
                    p: { xs: 3, md: 4 },
                    borderRadius: 4,
                    border: "1px dashed rgba(225,29,106,0.3)",
                    backgroundColor: "rgba(255,241,245,0.55)",
                  }}
                >
                  <Box sx={{ fontSize: "3rem", color: "#f472b6", lineHeight: 1 }}>{"{"}</Box>
                  <Box sx={{ fontFamily: HEBREW_FONTS, fontWeight: 700, color: "#6d3049", my: 1 }}>
                    {t.about.braceLine1}
                  </Box>
                  <Box sx={{ fontSize: "1.5rem", color: "#e11d6a", my: 0.5 }}>×</Box>
                  <Box sx={{ fontFamily: HEBREW_FONTS, fontWeight: 700, color: "#6d3049", my: 1 }}>
                    {t.about.braceLine2}
                  </Box>
                  <Box sx={{ fontSize: "3rem", color: "#f472b6", lineHeight: 1 }}>{"}"}</Box>
                </Box>
              </Reveal>
            </Box>
          </Container>
        </Box>

        {/* ---------------- FINAL CTA ---------------- */}
        <Box component="section" sx={{ py: { xs: 6, md: 10 }, backgroundColor: "#fffdfb" }}>
          <Container maxWidth="md">
            <Reveal>
              <Box
                sx={{
                  position: "relative",
                  overflow: "hidden",
                  textAlign: "center",
                  borderRadius: "28px",
                  px: { xs: 4, md: 7 },
                  py: { xs: 5, md: 7 },
                  backgroundColor: "#e11d6a",
                  boxShadow: "0 30px 70px rgba(159,18,57,0.3)",
                  "&::before": {
                    content: '""',
                    position: "absolute",
                    inset: 0,
                    background:
                      "radial-gradient(circle at 28% 18%, rgba(255,255,255,0.22), transparent 55%), radial-gradient(circle at 1px 1px, rgba(255,255,255,0.09) 1px, transparent 0)",
                    backgroundSize: "auto, 22px 22px",
                    pointerEvents: "none",
                  },
                }}
              >
                <Typography
                  variant="h2"
                  sx={{ position: "relative", color: "#fff", fontSize: { xs: "1.6rem", md: "2.1rem" } }}
                >
                  {t.cta.title}
                </Typography>
                <Typography
                  sx={{
                    position: "relative",
                    mt: 1.5,
                    color: "rgba(255,255,255,0.92)",
                    fontSize: "1.05rem",
                  }}
                >
                  {t.cta.text}
                </Typography>
                <Button
                  component={RouterLink}
                  to={AUTH_ROUTE}
                  size="large"
                  sx={{
                    position: "relative",
                    mt: 3.5,
                    px: 4.5,
                    py: 1.3,
                    fontWeight: 800,
                    backgroundColor: "#fff",
                    color: "#9f1239",
                    "&:hover": { backgroundColor: "#fff1f5" },
                  }}
                >
                  {t.cta.button}
                </Button>
              </Box>
            </Reveal>
          </Container>
        </Box>

        {/* ---------------- FOOTER ---------------- */}
        <Box
          component="footer"
          sx={{
            borderTop: "1px solid rgba(225,29,106,0.12)",
            backgroundColor: "#fffdfb",
            py: 4,
          }}
        >
          <Container maxWidth="lg">
            <Box
              sx={{
                display: "flex",
                flexDirection: { xs: "column", sm: "row" },
                alignItems: "center",
                justifyContent: "space-between",
                gap: 2,
              }}
            >
              <Stack direction="row" spacing={1.5} alignItems="center">
                <MatchQueensLogo size={18} />
                <Box aria-hidden="true" sx={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: "#f9a8d4" }} />
                <Typography sx={{ fontSize: "0.9rem", color: "#6d3049" }}>{t.footer.tagline}</Typography>
              </Stack>
              <Typography
                sx={{ fontFamily: '"Fira Code", monospace', fontSize: "0.82rem", color: "#b05a75" }}
              >
                © {year} Match Queens
              </Typography>
            </Box>
          </Container>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
