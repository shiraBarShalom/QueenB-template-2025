/**
 * MentorMe design tokens
 *
 * Import these when you need raw values outside MUI components:
 *   import { colors, fonts, radii, shadows } from "../theme/tokens";
 */

export const colors = {
  pink: {
    50: "#fff1f5",
    100: "#fce7f3",
    200: "#fbcfe8",
    300: "#f9a8d4",
    400: "#f472b6",
    500: "#e11d6a",
    600: "#be185d",
    700: "#9f1239",
    800: "#881337",
    900: "#4a1528",
  },
  rose: {
    300: "#fda4af",
    400: "#fb7185",
    500: "#f43f5e",
    600: "#e11d48",
  },
  white: "#ffffff",
  text: {
    primary: "#4a1528",
    secondary: "#8b3a55",
    muted: "#b05a75",
    onPrimary: "#ffffff",
  },
  border: "rgba(225, 29, 106, 0.16)",
  borderStrong: "rgba(225, 29, 106, 0.28)",
  overlay: "rgba(255, 255, 255, 0.72)",
};

export const fonts = {
  display: '"Fraunces", Georgia, serif',
  body: '"Nunito Sans", "Segoe UI", sans-serif',
};

export const radii = {
  sm: 8,
  md: 14,
  lg: 20,
  pill: 999,
};

export const shadows = {
  soft: "0 8px 24px rgba(225, 29, 106, 0.16)",
  medium: "0 16px 40px rgba(190, 24, 93, 0.14)",
  strong: "0 24px 60px rgba(190, 24, 93, 0.18)",
};

export const gradients = {
  page: `
    radial-gradient(ellipse 90% 70% at 10% 15%, rgba(251, 113, 133, 0.55), transparent 55%),
    radial-gradient(ellipse 80% 60% at 90% 85%, rgba(244, 114, 182, 0.45), transparent 50%),
    linear-gradient(165deg, #fff0f5 0%, #fce7f3 42%, #fda4af 100%)
  `,
  brandGlow:
    "radial-gradient(circle, rgba(255,255,255,0.55) 0%, rgba(244,114,182,0.35) 45%, transparent 70%)",
};

export const motion = {
  fast: "160ms ease",
  normal: "220ms ease",
  slow: "700ms ease-out",
};
