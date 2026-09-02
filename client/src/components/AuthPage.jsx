import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  IconButton,
  InputAdornment,
  TextField,
  Typography,
} from "@mui/material";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const emptyForm = {
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
};

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("signin");
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const isSignUp = mode === "signup";

  const headline = useMemo(
    () =>
      isSignUp
        ? "Create your account and find the mentor who fits."
        : "Welcome back — continue your mentoring journey.",
    [isSignUp]
  );

  const handleModeChange = (nextMode) => {
    setMode(nextMode);
    setErrors({});
    setForm(emptyForm);
  };

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const validate = () => {
    const next = {};

    if (isSignUp && !form.name.trim()) {
      next.name = "Name is required";
    }

    if (!form.email.trim()) {
      next.email = "Email is required";
    } else if (!EMAIL_PATTERN.test(form.email.trim())) {
      next.email = "Enter a valid email";
    }

    if (!form.password) {
      next.password = "Password is required";
    } else if (form.password.length < 6) {
      next.password = "Use at least 6 characters";
    }

    if (isSignUp) {
      if (!form.confirmPassword) {
        next.confirmPassword = "Confirm your password";
      } else if (form.confirmPassword !== form.password) {
        next.confirmPassword = "Passwords do not match";
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!validate()) return;
    navigate("/dashboard");
  };

  return (
    <Box
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
          radial-gradient(ellipse 90% 70% at 10% 15%, rgba(251, 113, 133, 0.55), transparent 55%),
          radial-gradient(ellipse 80% 60% at 90% 85%, rgba(244, 114, 182, 0.45), transparent 50%),
          linear-gradient(165deg, #fff0f5 0%, #fce7f3 42%, #fda4af 100%)
        `,
      }}
    >
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
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          width: { xs: 220, md: 340 },
          height: { xs: 220, md: 340 },
          borderRadius: "50%",
          top: { xs: "-8%", md: "-6%" },
          right: { xs: "-12%", md: "8%" },
          background:
            "radial-gradient(circle, rgba(255,255,255,0.55) 0%, rgba(244,114,182,0.35) 45%, transparent 70%)",
          animation: "mentorMeSoftPulse 7s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          width: { xs: 180, md: 280 },
          height: { xs: 180, md: 280 },
          borderRadius: "50%",
          bottom: { xs: "-6%", md: "4%" },
          left: { xs: "-10%", md: "6%" },
          background:
            "radial-gradient(circle, rgba(255,255,255,0.4) 0%, rgba(225,29,106,0.25) 50%, transparent 72%)",
          animation: "mentorMeSoftPulse 9s ease-in-out infinite",
          animationDelay: "1.2s",
          pointerEvents: "none",
        }}
      />

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
            fontFamily: '"Fraunces", Georgia, serif',
            fontWeight: 700,
            fontSize: { xs: "3rem", sm: "3.75rem" },
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            color: "#9f1239",
            textAlign: "center",
            mb: 1.25,
            textShadow: "0 10px 40px rgba(190, 24, 93, 0.18)",
          }}
        >
          MentorMe
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
            { id: "signin", label: "Sign in" },
            { id: "signup", label: "Sign up" },
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
          {isSignUp && (
            <TextField
              label="Name"
              name="name"
              autoComplete="name"
              value={form.name}
              onChange={handleChange("name")}
              error={Boolean(errors.name)}
              helperText={errors.name}
            />
          )}

          <TextField
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={handleChange("email")}
            error={Boolean(errors.email)}
            helperText={errors.email}
          />

          <TextField
            label="Password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            value={form.password}
            onChange={handleChange("password")}
            error={Boolean(errors.password)}
            helperText={errors.password}
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

          {isSignUp && (
            <TextField
              label="Confirm password"
              name="confirmPassword"
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={handleChange("confirmPassword")}
              error={Boolean(errors.confirmPassword)}
              helperText={errors.confirmPassword}
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

          <Button type="submit" variant="contained" size="large" sx={{ mt: 0.5 }}>
            {isSignUp ? "Create account" : "Sign in"}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

export default AuthPage;
