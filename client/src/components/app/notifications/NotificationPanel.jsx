import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  List,
  ListItemButton,
  Popover,
  Stack,
  Typography,
} from "@mui/material";
import NotificationsOffRoundedIcon from "@mui/icons-material/NotificationsOffRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";

import { useLanguage } from "../../../i18n/LanguageProvider";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../../api/notifications";
import { describeNotification, relativeTimeLabel } from "./notificationContent";

/**
 * The dropdown behind the notification bell.
 *
 * One panel for the authenticated user — it lists ALL of her notifications
 * regardless of which role (mentee / mentor) generated them. It owns the list
 * fetch; the bell owns the unread badge. After any change that affects the
 * unread count (open+read, click a row, "mark all read") it calls
 * `onCountChange(newCount)` so the badge stays in sync without a refetch.
 *
 * a11y: rendered in a Popover (focus is trapped and restored to the bell on
 * close). Each row is a real button — Enter/Space activate it, Tab moves
 * between them. The unread state is shown with a SHAPE (filled dot vs. hollow
 * ring) and an accessible label, never colour alone. `dir` follows the app
 * language so the list reads correctly in RTL.
 */
const PINK = "#e11d6a";

function UnreadDot({ unread, label }) {
  return (
    <Box
      component="span"
      aria-hidden={false}
      aria-label={unread ? label : undefined}
      role={unread ? "img" : undefined}
      sx={{
        flexShrink: 0,
        width: 10,
        height: 10,
        mt: "6px",
        borderRadius: "50%",
        boxSizing: "border-box",
        backgroundColor: unread ? PINK : "transparent",
        border: unread ? "none" : "2px solid rgba(109,48,73,0.35)",
      }}
    />
  );
}

export default function NotificationPanel({
  open,
  anchorEl,
  onClose,
  userId,
  onCountChange,
}) {
  const { t, dir, lang } = useLanguage();
  const c = t.app.notifications;
  const navigate = useNavigate();

  const [phase, setPhase] = useState("loading"); // "loading" | "ready" | "error"
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setPhase("loading");
    try {
      const data = await fetchNotifications(userId, { limit: 30 });
      setItems(Array.isArray(data.items) ? data.items : []);
      setPhase("ready");
      if (typeof data.unreadCount === "number") onCountChange(data.unreadCount);
    } catch {
      setPhase("error");
    }
  }, [userId, onCountChange]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const unreadCount = items.filter((n) => !n.readAt).length;

  const handleMarkAll = async () => {
    if (busy || unreadCount === 0) return;
    setBusy(true);
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    onCountChange(0);
    try {
      await markAllNotificationsRead(userId);
    } catch {
      load(); // reconcile — don't leave a fake "all read" on failure
    } finally {
      setBusy(false);
    }
  };

  const handleOpen = async (n) => {
    const { navTo } = describeNotification(n, t, lang);
    if (!n.readAt) {
      setItems((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x))
      );
      onCountChange(Math.max(0, unreadCount - 1));
      markNotificationRead(userId, n.id).catch(() => load());
    }
    onClose();
    if (navTo) navigate(navTo);
  };

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: dir === "rtl" ? "left" : "right" }}
      transformOrigin={{ vertical: "top", horizontal: dir === "rtl" ? "left" : "right" }}
      slotProps={{
        paper: {
          dir,
          sx: {
            mt: 1,
            width: { xs: 320, sm: 384 },
            maxWidth: "calc(100vw - 24px)",
            maxHeight: "min(70vh, 560px)",
            borderRadius: "18px",
            border: "1px solid rgba(225,29,106,0.16)",
            boxShadow: "0 18px 48px rgba(159,18,57,0.18)",
            overflow: "hidden",
          },
        },
      }}
    >
      <Stack sx={{ maxHeight: "min(70vh, 560px)" }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={1}
          sx={{ px: 2, py: 1.5 }}
        >
          <Typography component="h2" sx={{ fontWeight: 800, color: "#4a1528", fontSize: "1rem" }}>
            {c.title}
          </Typography>
          <Button
            size="small"
            onClick={handleMarkAll}
            disabled={busy || unreadCount === 0}
            sx={{ fontWeight: 700, fontSize: "0.8rem" }}
          >
            {c.markAllRead}
          </Button>
        </Stack>
        <Divider />

        <Box sx={{ overflowY: "auto", flex: 1 }}>
          {phase === "loading" && (
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ p: 2.5 }}>
              <CircularProgress size={18} />
              <Typography aria-live="polite" sx={{ color: "#6d3049", fontSize: "0.9rem" }}>
                {c.loading}
              </Typography>
            </Stack>
          )}

          {phase === "error" && (
            <Stack alignItems="center" spacing={1} sx={{ p: 3, textAlign: "center" }}>
              <ErrorOutlineRoundedIcon sx={{ color: PINK }} />
              <Typography sx={{ color: "#6d3049", fontSize: "0.9rem" }}>{c.error}</Typography>
              <Button size="small" variant="outlined" onClick={load} sx={{ fontWeight: 700 }}>
                {c.retry}
              </Button>
            </Stack>
          )}

          {phase === "ready" && items.length === 0 && (
            <Stack alignItems="center" spacing={1} sx={{ p: 4, textAlign: "center" }}>
              <Box
                sx={{
                  width: 46,
                  height: 46,
                  borderRadius: "14px",
                  display: "grid",
                  placeItems: "center",
                  color: PINK,
                  backgroundColor: "rgba(225,29,106,0.1)",
                }}
              >
                <NotificationsOffRoundedIcon />
              </Box>
              <Typography sx={{ fontWeight: 700, color: "#4a1528" }}>{c.emptyTitle}</Typography>
              <Typography sx={{ color: "#6d3049", fontSize: "0.88rem", lineHeight: 1.6 }}>
                {c.emptyHint}
              </Typography>
            </Stack>
          )}

          {phase === "ready" && items.length > 0 && (
            <List disablePadding>
              {items.map((n) => {
                const { text, explanation } = describeNotification(n, t, lang);
                const unread = !n.readAt;
                return (
                  <ListItemButton
                    key={n.id}
                    onClick={() => handleOpen(n)}
                    alignItems="flex-start"
                    sx={{
                      px: 2,
                      py: 1.25,
                      gap: 1.25,
                      alignItems: "flex-start",
                      backgroundColor: unread ? "rgba(225,29,106,0.055)" : "transparent",
                      "&:hover": { backgroundColor: "rgba(225,29,106,0.09)" },
                    }}
                  >
                    <UnreadDot unread={unread} label={c.unreadLabel} />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography
                        sx={{
                          color: "#4a1528",
                          fontSize: "0.9rem",
                          fontWeight: unread ? 700 : 500,
                          lineHeight: 1.5,
                        }}
                      >
                        {text}
                      </Typography>
                      {explanation ? (
                        <Typography
                          sx={{
                            mt: 0.5,
                            color: "#6d3049",
                            fontSize: "0.82rem",
                            lineHeight: 1.5,
                            whiteSpace: "pre-wrap",
                            borderInlineStart: "3px solid rgba(225,29,106,0.25)",
                            pl: 1,
                          }}
                        >
                          <Box component="span" sx={{ fontWeight: 700 }}>
                            {c.explanationLabel}{" "}
                          </Box>
                          {explanation}
                        </Typography>
                      ) : null}
                      <Typography sx={{ mt: 0.25, color: "#b05a75", fontSize: "0.78rem" }}>
                        {relativeTimeLabel(n.createdAt, lang, c.justNow)}
                      </Typography>
                    </Box>
                  </ListItemButton>
                );
              })}
            </List>
          )}
        </Box>
      </Stack>
    </Popover>
  );
}
