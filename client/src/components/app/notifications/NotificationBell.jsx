import React, { useCallback, useEffect, useRef, useState } from "react";
import { Badge, IconButton } from "@mui/material";
import NotificationsRoundedIcon from "@mui/icons-material/NotificationsRounded";

import { useLanguage } from "../../../i18n/LanguageProvider";
import { useCurrentUser } from "../../../auth/useCurrentUser";
import fillTemplate from "../../../utils/fillTemplate";
import { fetchUnreadCount } from "../../../api/notifications";
import NotificationPanel from "./NotificationPanel";

/**
 * The single notification bell for the authenticated user, mounted in the app
 * header (see AppNav). A dual-role user (mentee AND mentor) has ONE bell that
 * holds every notification, whichever role generated it.
 *
 * Responsibilities split:
 *   - this component owns the unread badge: it polls
 *     GET /api/users/:id/notifications/unread-count every POLL_MS, on window
 *     focus, and whenever the panel reports a change;
 *   - NotificationPanel owns the list.
 *
 * Visual: a round pink icon button that matches the product, with a small red
 * badge showing the unread count (hidden entirely at 0 — no meaningless "0").
 * a11y: the badge count is also spelled out in the button's aria-label, so it
 * doesn't rely on the red dot alone; `aria-haspopup` / `aria-expanded` describe
 * the popover.
 */
const POLL_MS = 45000;

export default function NotificationBell() {
  const { t } = useLanguage();
  const c = t.app.notifications;
  const { id: userId, isAuthenticated } = useCurrentUser();

  const [unreadCount, setUnreadCount] = useState(0);
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);
  const mounted = useRef(true);

  const refreshCount = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await fetchUnreadCount(userId);
      if (mounted.current && typeof data.unreadCount === "number") {
        setUnreadCount(data.unreadCount);
      }
    } catch {
      /* transient — keep the last known count, next poll will retry */
    }
  }, [userId]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) return undefined;
    refreshCount();
    const id = window.setInterval(refreshCount, POLL_MS);
    const onFocus = () => refreshCount();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [userId, refreshCount]);

  if (!isAuthenticated || !userId) return null;

  const label =
    unreadCount > 0 ? fillTemplate(c.bellWithCount, { count: unreadCount }) : c.bell;

  return (
    <>
      <IconButton
        onClick={(e) => setAnchorEl(e.currentTarget)}
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        sx={{
          width: 42,
          height: 42,
          color: "#9f1239",
          backgroundColor: "rgba(225,29,106,0.10)",
          border: "1px solid rgba(225,29,106,0.20)",
          "&:hover": { backgroundColor: "rgba(225,29,106,0.18)" },
        }}
      >
        <Badge
          badgeContent={unreadCount}
          max={99}
          color="error"
          overlap="circular"
          invisible={unreadCount === 0}
          sx={{ "& .MuiBadge-badge": { fontWeight: 700, fontSize: "0.68rem", minWidth: 16, height: 16 } }}
        >
          <NotificationsRoundedIcon fontSize="small" />
        </Badge>
      </IconButton>

      <NotificationPanel
        open={open}
        anchorEl={anchorEl}
        onClose={() => {
          setAnchorEl(null);
          refreshCount();
        }}
        userId={userId}
        onCountChange={setUnreadCount}
      />
    </>
  );
}
