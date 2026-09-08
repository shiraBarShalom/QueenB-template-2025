import React from "react";
import { Link as RouterLink } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import { Box, Button, Container, Stack, Typography } from "@mui/material";
import PersonSearchRoundedIcon from "@mui/icons-material/PersonSearchRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import Diversity3RoundedIcon from "@mui/icons-material/Diversity3Rounded";

import { ROUTES } from "../constants/routes";
import { useLanguage } from "../i18n/LanguageProvider";
import { useAuth } from "../context/AuthContext";
import { NAV_HEIGHT } from "../components/common/NavShell";
import LandingNav from "../components/landing/LandingNav";
import HeroArt from "../components/landing/HeroArt";
import Reveal from "../components/landing/Reveal";

const AUTH_ROUTE = ROUTES.LOGIN;

// The wrapper sets --mq-font-body / --mq-font-display from the shared
// language state; these consts just point at those CSS variables.
const STEP_ICONS = [PersonSearchRoundedIcon, EventAvailableRoundedIcon, Diversity3RoundedIcon];

const sectionAnchor = { scrollMarginTop: `${NAV_HEIGHT + 12}px` };

const accentRule = (
  <Box
    aria-hidden="true"
    sx={{ width: 56, height: 4, borderRadius: 999, background: "linear-gradient(90deg,#e11d6a,#f472b6)" }}
  />
);

const loginButtonSx = {
  px: { xs: 5, md: 6.5 },
  py: { xs: 1.4, md: 1.65 },
  minWidth: { xs: 200, md: 240 },
  fontFamily: "var(--mq-font-body)",
  fontWeight: 800,
  fontSize: { xs: "1.15rem", md: "1.28rem" },
  letterSpacing: "0.03em",
  color: "#fff",
  borderRadius: 999,
  background: "linear-gradient(180deg, #f472b6 0%, #e11d6a 100%)",
  boxShadow: "0 16px 36px rgba(225,29,106,0.32)",
  "&:hover": {
    background: "linear-gradient(180deg, #f9a8d4 0%, #e11d6a 100%)",
    boxShadow: "0 20px 44px rgba(225,29,106,0.38)",
    transform: "translateY(-3px)",
  },
};

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

export default function LandingPage() {
  // Language / direction / typography come from the shared LanguageProvider,
  // so the landing page and the authenticated area stay on one language.
  const { dir, t, fonts, theme } = useLanguage();
  // A signed-in visitor no longer needs the big "log in / sign up" CTAs — the
  // navbar carries her personalized menu. Swap them for a single "go to your
  // area" entry point instead. The rest of the page is unchanged.
  const { user } = useAuth();
  const primaryCtaTo = user ? ROUTES.APP : AUTH_ROUTE;
  const primaryCtaLabel = user ? t.nav.goToApp : t.nav.login;

  const steps = t.how.steps.map((s, i) => ({ ...s, icon: STEP_ICONS[i] }));

  return (
    <ThemeProvider theme={theme}>
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
        <LandingNav />
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

                <Box
                  sx={{
                    mt: { xs: 5.5, md: 7 },
                    width: "100%",
                    maxWidth: 520,
                    display: "flex",
                    justifyContent: "center",
                  }}
                >
                  <Button
                    component={RouterLink}
                    to={primaryCtaTo}
                    disableElevation
                    sx={loginButtonSx}
                  >
                    {primaryCtaLabel}
                  </Button>
                </Box>
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
                  <Typography id="about-title" variant="h2" sx={{ fontSize: { xs: "1.8rem", md: "2.4rem" } }}>
                    {t.about.title}
                  </Typography>
                  {accentRule}
                  <Typography
                    sx={{ mt: 2, maxWidth: 560, fontSize: "1.08rem", lineHeight: 1.85, color: "#6d3049" }}
                  >
                    {t.about.text}
                  </Typography>
                </Stack>
              </Reveal>

              <Reveal delay={120}>
                <Box
                  component="img"
                  src="/landing/queenb-about.png"
                  alt={t.about.title}
                  sx={{
                    width: "100%",
                    height: "auto",
                    display: "block",
                    borderRadius: 4,
                    objectFit: "contain",
                  }}
                />
              </Reveal>
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
                <Typography id="how-title" variant="h2" sx={{ fontSize: { xs: "1.8rem", md: "2.4rem" } }}>
                  {t.how.title}
                </Typography>
                {accentRule}
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

        <Box
          component="section"
          sx={{
            position: "relative",
            overflow: "hidden",
            width: "100%",
            py: { xs: 6, md: 8 },
            px: 2,
            textAlign: "center",
            backgroundColor: "#e11d6a",
            backgroundImage:
              "radial-gradient(circle at 28% 18%, rgba(255,255,255,0.22), transparent 55%), radial-gradient(circle at 1px 1px, rgba(255,255,255,0.14) 1px, transparent 0)",
            backgroundSize: "auto, 22px 22px",
          }}
        >
          <Container maxWidth="md" sx={{ position: "relative" }}>
            <Reveal>
              <Stack spacing={1.5} alignItems="center">
                <Typography
                  variant="h2"
                  sx={{ color: "#fff", fontSize: { xs: "1.6rem", md: "2.1rem" } }}
                >
                  {t.cta.title}
                </Typography>
                <Typography sx={{ color: "rgba(255,255,255,0.92)", fontSize: "1.05rem" }}>
                  {t.cta.text}
                </Typography>
                <Button
                  component={RouterLink}
                  to={primaryCtaTo}
                  disableElevation
                  sx={{
                    mt: 1.5,
                    px: 4.5,
                    py: 1.2,
                    minWidth: 148,
                    fontFamily: "var(--mq-font-body)",
                    fontWeight: 800,
                    fontSize: "1.02rem",
                    color: "#9f1239",
                    borderRadius: 999,
                    backgroundColor: "#fff",
                    boxShadow: "0 10px 24px rgba(80, 10, 40, 0.18)",
                    "&:hover": {
                      backgroundColor: "#fff1f5",
                      transform: "translateY(-2px)",
                    },
                  }}
                >
                  {user ? t.nav.goToApp : t.cta.button}
                </Button>
              </Stack>
            </Reveal>
          </Container>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
