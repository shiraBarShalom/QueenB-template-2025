import { createTheme } from "@mui/material";

// Match Queens design system — elegant pink palette.
// Component defaults live here so features don't need per-component styling.
const theme = createTheme({
  palette: {
    primary: {
      main: "#d6336c",   // deep rose — primary actions, headers
      light: "#f06595",
      dark: "#a61e4d",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#f8bbd0",   // soft blush pink — accents, chips, highlights
      light: "#fce4ec",
      dark: "#e491b0",
      contrastText: "#4a0e2b",
    },
    background: {
      default: "#fff5f7", // faint pink-white page background
      paper: "#ffffff",
    },
    text: {
      primary: "#3d1f2b",
      secondary: "#8a6270",
    },
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily: "'Poppins', 'Roboto', 'Helvetica', 'Arial', sans-serif",
    h1: { fontWeight: 700 },
    h2: { fontWeight: 700 },
    h3: { fontWeight: 600 },
    h4: { fontWeight: 600 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 500 },
    button: {
      fontWeight: 600,
      textTransform: "none", // no shouty uppercase buttons
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 999, // pill-shaped buttons
          padding: "8px 22px",
          boxShadow: "none",
          "&:hover": {
            boxShadow: "0 4px 14px rgba(214, 51, 108, 0.25)",
          },
        },
        containedPrimary: {
          background: "linear-gradient(135deg, #f06595 0%, #d6336c 100%)",
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: "outlined",
      },
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: 10,
            backgroundColor: "#ffffff",
            "& fieldset": {
              borderColor: "#f3d1dc",
            },
            "&:hover fieldset": {
              borderColor: "#f06595",
            },
            "&.Mui-focused fieldset": {
              borderColor: "#d6336c",
            },
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 16,
        },
        elevation1: {
          boxShadow: "0 2px 12px rgba(214, 51, 108, 0.08)",
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: "0 2px 10px rgba(214, 51, 108, 0.15)",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
  },
});

export default theme;
