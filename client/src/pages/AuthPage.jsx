import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  IconButton,
  InputAdornment,
  TextField,
  Typography,
} from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageProvider";
import LanguageSwitcher from "../components/common/LanguageSwitcher";

/**
 * Sign in / sign up.
 *
 * VISUAL: this project's own AuthPage UI — soft pink gradient, the "{ }" accent
 * that echoes the landing page, the Match Queens wordmark, the pill tab switcher and
 * the glass form card. Unchanged.
 *
 * BEHAVIOUR: wired to the real session auth on this branch (no mock / demo):
 *   sign up -> POST /api/users/register  ({ displayName, email, password })
 *   sign in -> POST /api/users/login     ({ email, password })
 * Both set the httpOnly `mentorme.sid` session cookie via AuthContext. After
 * sign-up, GuestOnly sends the user to /onboarding to fill in their details.
 *
 * Two elements exist only to support real auth (the original mock UI had
 * neither): an inline <Alert> for server / network errors, and a disabled
 * "Please wait…" submit state that blocks a double submit mid-request.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const emptyForm = {
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
};

function AuthPage() {
  const { signIn, signUp, sessionError } = useAuth();
  const { t, dir, theme } = useLanguage();
  const copy = t.auth;
  const [mode, setMode] = useState("signin");
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");

  const isSignUp = mode === "signup";
  const isRtl = dir === "rtl";
  const headline = isSignUp ? copy.createAccount : copy.welcomeBack;

  // MUI outlined labels stay physically left unless we pin them to the
  // inline-start side. Password fields also need extra end-padding for the eye.
  const fieldSx = {
    "& .MuiOutlinedInput-input": {
      textAlign: isRtl ? "right" : "left",
    },
    "& .MuiInputLabel-root": {
      left: isRtl ? "auto" : 0,
      right: isRtl ? 0 : "auto",
      transformOrigin: isRtl ? "top right" : "top left",
    },
    "& .MuiInputLabel-root:not(.MuiInputLabel-shrink)": {
      transform: isRtl
        ? "translate(-14px, 16px) scale(1)"
        : "translate(14px, 16px) scale(1)",
    },
    "& .MuiInputLabel-shrink": {
      transform: isRtl
        ? "translate(-14px, -9px) scale(0.75)"
        : "translate(14px, -9px) scale(0.75)",
    },
  };
  const passwordFieldSx = {
    ...fieldSx,
    "& .MuiOutlinedInput-input": {
      ...fieldSx["& .MuiOutlinedInput-input"],
      paddingInlineEnd: "46px",
    },
  };

  const handleModeChange = (nextMode) => {
    setMode(nextMode);
    setErrors({});
    setForm(emptyForm);
    setApiError("");
  };

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    if (apiError) setApiError("");
  };

  const validate = () => {
    const next = {};

    if (isSignUp && !form.name.trim()) {
      next.name = copy.nameRequired;
    }

    if (!form.email.trim()) {
      next.email = copy.emailRequired;
    } else if (!EMAIL_PATTERN.test(form.email.trim())) {
      next.email = copy.emailInvalid;
    }

    if (!form.password) {
      next.password = copy.passwordRequired;
    } else if (isSignUp && form.password.length < 12) {
      next.password = copy.passwordShort;
    }

    if (isSignUp) {
      if (!form.confirmPassword) {
        next.confirmPassword = copy.confirmRequired;
      } else if (form.confirmPassword !== form.password) {
        next.confirmPassword = copy.confirmMismatch;
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setApiError("");
    try {
      if (isSignUp) {
        await signUp({
          displayName: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
        });
      } else {
        await signIn({
          email: form.email.trim(),
          password: form.password,
        });
      }
      setForm(emptyForm);
      setErrors({});
      // GuestOnly / postAuthPath sends new accounts to /onboarding and
      // completed profiles into /app. Do not hard-route everyone to /app.
    } catch (error) {
      const serverData = error.response?.data;
      const fieldErrors = serverData?.data?.fields;
      if (fieldErrors) {
        setErrors({
          name: fieldErrors.displayName?.[0],
          email: fieldErrors.email?.[0],
          password: fieldErrors.password?.[0],
        });
      }
      setApiError(serverData?.message || copy.connectError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ThemeProvider theme={theme}>
    <Box
      dir={dir}
      sx={{
        minHeight: "100vh",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: { xs: 2.5, sm: 4 },
        py: { xs: 4, sm: 6 },
        background: `
          radial-gradient(ellipse 90% 70% at 10% 15%, rgba(244, 114, 182, 0.22), transparent 55%),
          radial-gradient(ellipse 80% 60% at 90% 85%, rgba(251, 113, 133, 0.18), transparent 50%),
          linear-gradient(165deg, #fffdfb 0%, #fff1f5 55%, #fce7f3 100%)
        `,
      }}
    >
      <Box sx={{ position: "absolute", top: 16, insetInlineEnd: 16, zIndex: 2 }}>
        <LanguageSwitcher variant="button" label={t.nav.language} />
      </Box>
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            radial-gradient(circle at 1px 1px, rgba(190, 24, 93, 0.12) 1px, transparent 0)
          `,
          backgroundSize: "28px 28px",
          opacity: 0.45,
          pointerEvents: "none",
        }}
      />
      {/* Same soft curly-brace accent used on the public landing page, for a cohesive feel */}
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          top: { xs: -40, md: -20 },
          left: { xs: -20, md: 30 },
          fontFamily: '"Fira Code", monospace',
          fontSize: { xs: 160, md: 260 },
          fontWeight: 700,
          lineHeight: 1,
          color: "rgba(225, 29, 106, 0.06)",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        {"{ }"}
      </Box>

      <Box
        sx={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 440,
          animation: "mentorMeFadeUp 700ms ease-out both",
        }}
      >
        <Typography
          component="h1"
          sx={{
            fontFamily: "var(--mq-font-display), Georgia, serif",
            fontWeight: 700,
            fontSize: { xs: "2.4rem", sm: "3.25rem" },
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            color: "#9f1239",
            textAlign: "center",
            mb: 1.25,
            textShadow: "0 10px 40px rgba(190, 24, 93, 0.18)",
          }}
        >
          Match Queens
        </Typography>

        <Typography
          sx={{
            textAlign: "center",
            color: "#8b3a55",
            fontSize: { xs: "1rem", sm: "1.1rem" },
            lineHeight: 1.5,
            maxWidth: 360,
            mx: "auto",
            mb: 3.5,
            animation: "mentorMeFadeUp 700ms ease-out 120ms both",
          }}
        >
          {headline}
        </Typography>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 1,
            p: 0.75,
            mb: 2.5,
            borderRadius: 999,
            background: "rgba(255, 255, 255, 0.45)",
            border: "1px solid rgba(225, 29, 106, 0.18)",
            backdropFilter: "blur(8px)",
            animation: "mentorMeFadeUp 700ms ease-out 180ms both",
          }}
        >
          {[
            { id: "signin", label: copy.signIn },
            { id: "signup", label: copy.signUp },
          ].map((tab) => {
            const active = mode === tab.id;
            return (
              <Button
                key={tab.id}
                type="button"
                onClick={() => handleModeChange(tab.id)}
                sx={{
                  py: 1.1,
                  color: active ? "#fff" : "#9f1239",
                  backgroundColor: active ? "#e11d6a" : "transparent",
                  boxShadow: active
                    ? "0 8px 20px rgba(225, 29, 106, 0.28)"
                    : "none",
                  "&:hover": {
                    backgroundColor: active ? "#be185d" : "rgba(255,255,255,0.55)",
                    boxShadow: active
                      ? "0 8px 24px rgba(225, 29, 106, 0.32)"
                      : "none",
                    transform: "none",
                  },
                }}
              >
                {tab.label}
              </Button>
            );
          })}
        </Box>

        <Box
          component="form"
          onSubmit={handleSubmit}
          noValidate
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            p: { xs: 2.5, sm: 3 },
            borderRadius: 3,
            background: "rgba(255, 255, 255, 0.72)",
            border: "1px solid rgba(225, 29, 106, 0.16)",
            backdropFilter: "blur(12px)",
            boxShadow: "0 24px 60px rgba(190, 24, 93, 0.12)",
            animation: "mentorMeFadeUp 700ms ease-out 240ms both",
            transition: "opacity 220ms ease, transform 220ms ease",
          }}
        >
          {(apiError || sessionError) && (
            <Alert severity="error">{apiError || sessionError}</Alert>
          )}

          {isSignUp && (
            <TextField
              label={copy.name}
              name="name"
              autoComplete="name"
              value={form.name}
              onChange={handleChange("name")}
              error={Boolean(errors.name)}
              helperText={errors.name}
              sx={fieldSx}
            />
          )}

          <TextField
            label={copy.email}
            name="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={handleChange("email")}
            error={Boolean(errors.email)}
            helperText={errors.email}
            sx={fieldSx}
          />

          <TextField
            label={copy.password}
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            value={form.password}
            onChange={handleChange("password")}
            error={Boolean(errors.password)}
            helperText={errors.password}
            sx={passwordFieldSx}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((v) => !v)}
                    edge="end"
                    size="small"
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          {!isSignUp && (
            <Button
              component={Link}
              to="/forgot-password"
              variant="text"
              sx={{ alignSelf: "flex-start", px: 0, minWidth: 0 }}
            >
              {copy.forgotPassword}
            </Button>
          )}

          {isSignUp && (
            <TextField
              label={copy.confirmPassword}
              name="confirmPassword"
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={handleChange("confirmPassword")}
              error={Boolean(errors.confirmPassword)}
              helperText={errors.confirmPassword}
              sx={passwordFieldSx}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label={
                        showConfirm ? "Hide confirm password" : "Show confirm password"
                      }
                      onClick={() => setShowConfirm((v) => !v)}
                      edge="end"
                      size="small"
                    >
                      {showConfirm ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          )}

          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={submitting}
            sx={{ mt: 0.5 }}
          >
            {submitting ? copy.wait : isSignUp ? copy.submitSignUp : copy.submitSignIn}
          </Button>
        </Box>
      </Box>
    </Box>
    </ThemeProvider>
  );
}

export default AuthPage;
