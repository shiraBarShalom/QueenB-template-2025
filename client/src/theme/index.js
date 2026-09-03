/**
 * MentorMe shared MUI theme
 *
 * Already applied app-wide via ThemeProvider in App.js.
 *
 * Usage for partners:
 *   import { useTheme } from "@mui/material/styles";
 *   const theme = useTheme();
 *   // theme.palette.primary.main, theme.typography.h4, etc.
 *
 *   import theme, { colors, fonts } from "../theme";
 *   // or: import { colors, fonts, radii, shadows } from "../theme/tokens";
 *
 * Prefer MUI components (Button, TextField, Typography, Box, Stack)
 * so styles stay consistent without one-off CSS.
 */

import { createTheme } from "@mui/material";
import { colors, fonts, radii, shadows } from "./tokens";

export { colors, fonts, radii, shadows, gradients, motion } from "./tokens";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: colors.pink[500],
      light: colors.pink[400],
      dark: colors.pink[600],
      contrastText: colors.text.onPrimary,
    },
    secondary: {
      main: colors.rose[400],
      light: colors.rose[300],
      dark: colors.rose[600],
      contrastText: colors.text.onPrimary,
    },
    background: {
      default: colors.pink[50],
      paper: colors.white,
    },
    text: {
      primary: colors.text.primary,
      secondary: colors.text.secondary,
    },
    divider: colors.border,
    error: {
      main: "#dc2626",
    },
    success: {
      main: "#15803d",
    },
    warning: {
      main: "#d97706",
    },
    info: {
      main: colors.pink[600],
    },
  },
  typography: {
    fontFamily: fonts.body,
    h1: {
      fontFamily: fonts.display,
      fontWeight: 700,
      letterSpacing: "-0.03em",
    },
    h2: {
      fontFamily: fonts.display,
      fontWeight: 700,
      letterSpacing: "-0.02em",
    },
    h3: {
      fontFamily: fonts.display,
      fontWeight: 600,
    },
    h4: {
      fontFamily: fonts.display,
      fontWeight: 600,
    },
    h5: {
      fontFamily: fonts.display,
      fontWeight: 550,
    },
    h6: {
      fontFamily: fonts.display,
      fontWeight: 550,
    },
    subtitle1: {
      fontFamily: fonts.body,
      fontWeight: 600,
    },
    subtitle2: {
      fontFamily: fonts.body,
      fontWeight: 600,
    },
    body1: {
      fontFamily: fonts.body,
      fontWeight: 400,
    },
    body2: {
      fontFamily: fonts.body,
      fontWeight: 400,
    },
    button: {
      fontFamily: fonts.body,
      fontWeight: 700,
      textTransform: "none",
      letterSpacing: "0.01em",
    },
  },
  shape: {
    borderRadius: radii.md,
  },
  shadows: [
    "none",
    "0 1px 3px rgba(190, 24, 93, 0.08)",
    "0 2px 8px rgba(190, 24, 93, 0.1)",
    shadows.soft,
    shadows.soft,
    shadows.medium,
    shadows.medium,
    shadows.medium,
    shadows.strong,
    shadows.strong,
    shadows.strong,
    shadows.strong,
    shadows.strong,
    shadows.strong,
    shadows.strong,
    shadows.strong,
    shadows.strong,
    shadows.strong,
    shadows.strong,
    shadows.strong,
    shadows.strong,
    shadows.strong,
    shadows.strong,
    shadows.strong,
    shadows.strong,
  ],
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: colors.pink[50],
          color: colors.text.primary,
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: radii.pill,
          paddingInline: 22,
          paddingBlock: 10,
          transition:
            "transform 180ms ease, box-shadow 180ms ease, background-color 180ms ease",
          "&:hover": {
            boxShadow: shadows.soft,
            transform: "translateY(-1px)",
          },
          "&:active": {
            transform: "translateY(0)",
          },
        },
        containedPrimary: {
          "&:hover": {
            backgroundColor: colors.pink[600],
          },
        },
        outlined: {
          borderColor: colors.borderStrong,
          color: colors.pink[700],
          "&:hover": {
            borderColor: colors.pink[500],
            backgroundColor: "rgba(225, 29, 106, 0.06)",
          },
        },
        text: {
          color: colors.pink[700],
          "&:hover": {
            backgroundColor: "rgba(225, 29, 106, 0.06)",
          },
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: "outlined",
        fullWidth: true,
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: radii.md,
          backgroundColor: colors.white,
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: colors.pink[400],
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: colors.pink[500],
            borderWidth: 2,
          },
        },
      },
    },
    MuiAppBar: {
      defaultProps: {
        elevation: 0,
        color: "primary",
      },
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
        colorPrimary: {
          backgroundColor: colors.pink[500],
          color: colors.text.onPrimary,
        },
      },
    },
    MuiPaper: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          backgroundImage: "none",
          border: `1px solid ${colors.border}`,
        },
        rounded: {
          borderRadius: radii.md,
        },
      },
    },
    MuiCard: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          border: `1px solid ${colors.border}`,
          borderRadius: radii.lg,
          boxShadow: shadows.soft,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: radii.pill,
          fontWeight: 600,
        },
        filledPrimary: {
          backgroundColor: colors.pink[500],
        },
      },
    },
    MuiLink: {
      defaultProps: {
        underline: "hover",
      },
      styleOverrides: {
        root: {
          color: colors.pink[600],
          fontWeight: 600,
        },
      },
    },
    MuiToolbar: {
      styleOverrides: {
        root: {
          minHeight: 64,
        },
      },
    },
  },
});

export default theme;
