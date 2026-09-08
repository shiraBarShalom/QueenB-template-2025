import React, { useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
  Avatar,
  Box,
  Button,
  Divider,
  ListItemIcon,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from "@mui/material";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import Diversity3RoundedIcon from "@mui/icons-material/Diversity3Rounded";
import WorkspacePremiumRoundedIcon from "@mui/icons-material/WorkspacePremiumRounded";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";

import { ROUTES } from "../../constants/routes";
import { useLanguage } from "../../i18n/LanguageProvider";
import { useCurrentUser } from "../../auth/useCurrentUser";
import { useAuth } from "../../context/AuthContext";
import fillTemplate from "../../utils/fillTemplate";

/**
 * Personalized account menu for the PUBLIC landing navbar, shown only when a
 * session exists. Items are role-filtered from the real useCurrentUser() seam
 * — nothing is hardcoded:
 *   - Personal area      always
 *   - Mentor area        only when isMentor
 *   - Become a mentor    only when !isMentor
 *   - Admin dashboard    only when isAdmin
 *   - Log out            always (destroys the server session, back to "/")
 *
 * `variant="desktop"` renders the "Hi, {name}" trigger + dropdown.
 * `variant="drawer"`  renders a flat button list for the mobile drawer;
 *                     `onNavigate` is called after each item is chosen so the
 *                     drawer can close itself.
 */
function firstName(name) {
  return (name || "").trim().split(/\s+/)[0] || "";
}

export default function LandingUserMenu({ variant = "desktop", onNavigate }) {
  const { t } = useLanguage();
  const nav = t.nav;
  const { displayName, isMentor, isAdmin } = useCurrentUser();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState(null);
  const [signingOut, setSigningOut] = useState(false);

  const items = [
    {
      key: "personalArea",
      label: nav.personalArea,
      to: ROUTES.APP_PERSONAL_AREA,
      icon: PersonRoundedIcon,
    },
    isMentor
      ? {
          key: "mentorArea",
          label: nav.mentorArea,
          to: ROUTES.APP_MENTOR_AREA,
          icon: Diversity3RoundedIcon,
        }
      : {
          key: "becomeMentor",
          label: nav.becomeMentor,
          to: ROUTES.APP_BECOME_MENTOR,
          icon: WorkspacePremiumRoundedIcon,
        },
    isAdmin && {
      key: "admin",
      label: nav.adminDashboard,
      to: "/admin",
      icon: ShieldRoundedIcon,
    },
  ].filter(Boolean);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
    } catch {
      /* leave the area even if the network call fails */
    } finally {
      setSigningOut(false);
      setAnchor(null);
      onNavigate?.();
      navigate(ROUTES.HOME, { replace: true });
    }
  };

  const initials = firstName(displayName).slice(0, 1).toUpperCase() || "?";

  if (variant === "drawer") {
    return (
      <Stack spacing={0.5}>
        <Typography
          sx={{
            px: 1,
            py: 0.5,
            fontWeight: 800,
            color: "#9f1239",
            fontFamily: "var(--mq-font-body)",
          }}
        >
          {fillTemplate(nav.greeting, { name: firstName(displayName) })}
        </Typography>
        {items.map((item) => (
          <Button
            key={item.key}
            component={RouterLink}
            to={item.to}
            onClick={() => onNavigate?.()}
            fullWidth
            startIcon={<item.icon fontSize="small" />}
            sx={{
              gap: 1,
              justifyContent: "flex-start",
              fontFamily: "var(--mq-font-body)",
              fontWeight: 600,
              fontSize: "1.05rem",
              color: "#4a1528",
              py: 1.2,
              "& .MuiButton-startIcon": { margin: 0 },
            }}
          >
            {item.label}
          </Button>
        ))}
        <Button
          onClick={handleSignOut}
          disabled={signingOut}
          fullWidth
          startIcon={<LogoutRoundedIcon fontSize="small" />}
          sx={{
            gap: 1,
            justifyContent: "flex-start",
            fontFamily: "var(--mq-font-body)",
            fontWeight: 600,
            fontSize: "1.05rem",
            color: "#6d3049",
            py: 1.2,
            "& .MuiButton-startIcon": { margin: 0 },
          }}
        >
          {nav.logout}
        </Button>
      </Stack>
    );
  }

  return (
    <>
      <Button
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        aria-label={nav.menu}
        disableRipple
        endIcon={<ExpandMoreRoundedIcon />}
        sx={{
          minHeight: 40,
          px: 1,
          borderRadius: 999,
          color: "#9f1239",
          fontFamily: "var(--mq-font-body)",
          fontWeight: 700,
          textTransform: "none",
          "&:hover": { backgroundColor: "rgba(225,29,106,0.07)" },
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1.25}>
          <Avatar
            sx={{
              width: 30,
              height: 30,
              flexShrink: 0,
              fontSize: "0.85rem",
              fontWeight: 700,
              bgcolor: "#e11d6a",
              color: "#fff",
            }}
          >
            {initials}
          </Avatar>
          <Box component="span" sx={{ whiteSpace: "nowrap" }}>
            {fillTemplate(nav.greeting, { name: firstName(displayName) })}
          </Box>
        </Stack>
      </Button>

      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        PaperProps={{ sx: { minWidth: 220, borderRadius: 2, mt: 1 } }}
      >
        {items.map((item) => (
          <MenuItem
            key={item.key}
            component={RouterLink}
            to={item.to}
            onClick={() => setAnchor(null)}
            sx={{ py: 1.1, fontFamily: "var(--mq-font-body)", fontWeight: 600 }}
          >
            <ListItemIcon sx={{ color: "#e11d6a", minWidth: 36, mr: 0 }}>
              <item.icon fontSize="small" />
            </ListItemIcon>
            {item.label}
          </MenuItem>
        ))}
        <Divider />
        <MenuItem
          onClick={handleSignOut}
          disabled={signingOut}
          sx={{ py: 1.1, fontFamily: "var(--mq-font-body)", fontWeight: 600, color: "#6d3049" }}
        >
          <ListItemIcon sx={{ color: "#6d3049", minWidth: 36, mr: 0 }}>
            <LogoutRoundedIcon fontSize="small" />
          </ListItemIcon>
          {nav.logout}
        </MenuItem>
      </Menu>
    </>
  );
}
