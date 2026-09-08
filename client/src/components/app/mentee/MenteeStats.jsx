import React, { useEffect, useState } from "react";
import { Box, ButtonBase, Collapse, Divider, Skeleton, Stack, Typography } from "@mui/material";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import MarkChatUnreadRoundedIcon from "@mui/icons-material/MarkChatUnreadRounded";
import Diversity3RoundedIcon from "@mui/icons-material/Diversity3Rounded";

import { useLanguage } from "../../../i18n/LanguageProvider";
import { useCurrentUser } from "../../../auth/useCurrentUser";
import useCountUp from "../../../hooks/useCountUp";
import { formatDateTimeLabel } from "../../../utils/slotTime";
import { fetchMyMenteeRequests } from "../../../api/profile";
import { fetchMenteeScheduling } from "../../../api/menteeScheduling";

/**
 * A small, motivating summary strip for the mentee Personal Area — same spirit
 * as the mentor DashboardSummary: each tile is a toggle that reveals the actual
 * records behind its number in an expandable panel.
 *
 * Every number AND every detail row comes from the SAME fetch, so the panel can
 * never disagree with the count. Data is derived only from the scheduling state
 * machine's own statuses — nothing is fabricated:
 *   upcomingMeetings  = /scheduling rows that are MATCHED with a future meeting
 *   completedMeetings = /requests rows in COMPLETED or FEEDBACK_COMPLETED
 *   activeRequests    = /requests rows in WAITING_FOR_MENTOR_SLOTS or
 *                       WAITING_FOR_MENTEE_SELECTION
 *   mentorsConnected  = distinct mentor across requests that reached MATCHED+
 */
const ACTIVE = new Set(["WAITING_FOR_MENTOR_SLOTS", "WAITING_FOR_MENTEE_SELECTION"]);
const COMPLETED = new Set(["COMPLETED", "FEEDBACK_COMPLETED"]);
const CONNECTED = new Set([
  "MATCHED",
  "ATTENDANCE_CONFIRMED",
  "COMPLETED",
  "FEEDBACK_COMPLETED",
]);

function mentorLine(jobTitle, workplace) {
  return [jobTitle, workplace].filter(Boolean).join(" · ");
}

function buildRecords(reqRows, schedRows, { lang, chipCopy }) {
  const now = Date.now();

  const upcomingMeetings = schedRows
    .filter(
      (r) =>
        r.status === "MATCHED" &&
        r.meeting &&
        new Date(r.meeting.scheduledStart).getTime() >= now
    )
    .sort(
      (a, b) =>
        new Date(a.meeting.scheduledStart) - new Date(b.meeting.scheduledStart)
    )
    .map((r) => ({
      id: `u${r.id}`,
      title: r.mentor?.fullName || "",
      subtitle: mentorLine(r.mentor?.jobTitle, r.mentor?.workplace),
      meta: formatDateTimeLabel(r.meeting.scheduledStart, lang),
    }));

  const completedMeetings = reqRows
    .filter((r) => COMPLETED.has(r.status))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .map((r) => ({
      id: `c${r.id}`,
      title: r.mentorProfile?.user?.fullName || "",
      subtitle: mentorLine(
        r.mentorProfile?.user?.jobTitle,
        r.mentorProfile?.user?.workplace
      ),
      meta: new Date(r.updatedAt).toLocaleDateString(lang, {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    }));

  const activeRequests = reqRows
    .filter((r) => ACTIVE.has(r.status))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((r) => ({
      id: `a${r.id}`,
      title: r.mentorProfile?.user?.fullName || "",
      subtitle: mentorLine(
        r.mentorProfile?.user?.jobTitle,
        r.mentorProfile?.user?.workplace
      ),
      meta: (chipCopy && chipCopy[r.status]) || "",
    }));

  const seen = new Set();
  const mentorsConnected = [];
  reqRows
    .filter((r) => CONNECTED.has(r.status))
    .forEach((r) => {
      if (seen.has(r.mentorProfileId)) return;
      seen.add(r.mentorProfileId);
      mentorsConnected.push({
        id: `m${r.mentorProfileId}`,
        title: r.mentorProfile?.user?.fullName || "",
        subtitle: mentorLine(
          r.mentorProfile?.user?.jobTitle,
          r.mentorProfile?.user?.workplace
        ),
        meta: "",
      });
    });

  return {
    counts: {
      upcomingMeetings: upcomingMeetings.length,
      completedMeetings: completedMeetings.length,
      activeRequests: activeRequests.length,
      mentorsConnected: mentorsConnected.length,
    },
    records: { upcomingMeetings, completedMeetings, activeRequests, mentorsConnected },
  };
}

function StatTile({ icon: Icon, label, value, loading, selected, onSelect, controls }) {
  const shown = useCountUp(loading ? null : value);
  return (
    <ButtonBase
      onClick={onSelect}
      disableRipple
      aria-pressed={selected}
      aria-controls={controls}
      aria-label={loading ? label : `${label}: ${value}`}
      sx={{
        display: "block",
        width: "100%",
        textAlign: "start",
        p: { xs: 2, md: 2.5 },
        borderRadius: "16px",
        backgroundColor: selected ? "rgba(225,29,106,0.06)" : "#fff",
        border: selected ? "2px solid #e11d6a" : "1px solid rgba(225,29,106,0.14)",
        boxShadow: selected
          ? "0 14px 32px rgba(159,18,57,0.12)"
          : "0 10px 28px rgba(159,18,57,0.06)",
        transition: "border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease",
        "&:hover": { transform: "translateY(-1px)", borderColor: "#e11d6a" },
        "&.Mui-focusVisible": { outline: "2px solid #9f1239", outlineOffset: 2 },
      }}
    >
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: "12px",
          display: "grid",
          placeItems: "center",
          color: "#e11d6a",
          backgroundColor: "rgba(225,29,106,0.1)",
          mb: 1.25,
        }}
      >
        <Icon fontSize="small" />
      </Box>
      {loading ? (
        <Skeleton variant="text" width={44} height={40} />
      ) : (
        <Typography
          aria-hidden="true"
          sx={{
            fontSize: { xs: "1.7rem", md: "1.9rem" },
            fontWeight: 800,
            lineHeight: 1.1,
            color: "#9f1239",
          }}
        >
          {shown}
        </Typography>
      )}
      <Typography
        sx={{
          mt: 0.25,
          fontSize: "0.85rem",
          fontWeight: selected ? 700 : 600,
          color: selected ? "#9f1239" : "#6d3049",
        }}
      >
        {label}
      </Typography>
    </ButtonBase>
  );
}

function DetailRow({ row }) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={0.25}
      justifyContent="space-between"
      alignItems={{ xs: "flex-start", sm: "center" }}
      sx={{ py: 1.25 }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, color: "#4a1528", fontSize: "0.95rem" }}>
          {row.title || "—"}
        </Typography>
        {row.subtitle && (
          <Typography sx={{ color: "#6d3049", fontSize: "0.85rem" }}>
            {row.subtitle}
          </Typography>
        )}
      </Box>
      {row.meta && (
        <Typography
          sx={{ color: "#b05a75", fontSize: "0.85rem", whiteSpace: "nowrap", fontWeight: 600 }}
        >
          {row.meta}
        </Typography>
      )}
    </Stack>
  );
}

const PANEL_ID = "mentee-stats-detail";

export default function MenteeStats() {
  const { t, lang } = useLanguage();
  const c = t.app.personalArea.stats;
  const chipCopy = t.app.personalArea.scheduling.statuses.chip;
  const { id: userId } = useCurrentUser();

  const [phase, setPhase] = useState("loading"); // "loading" | "ready" | "error"
  const [data, setData] = useState(null); // { counts, records }
  const [openKey, setOpenKey] = useState(null);

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;

    (async () => {
      setPhase("loading");
      try {
        const [requests, scheduling] = await Promise.all([
          fetchMyMenteeRequests(userId),
          fetchMenteeScheduling(userId).catch(() => []),
        ]);
        if (cancelled) return;
        const built = buildRecords(
          Array.isArray(requests) ? requests : [],
          Array.isArray(scheduling) ? scheduling : [],
          { lang, chipCopy }
        );
        setData(built);
        setPhase("ready");
      } catch {
        if (!cancelled) setPhase("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, lang, chipCopy]);

  if (phase === "error") return null; // stats are a bonus — never block the page

  const loading = phase === "loading";
  const tiles = [
    { key: "upcomingMeetings", icon: EventAvailableRoundedIcon, label: c.upcomingMeetings },
    { key: "completedMeetings", icon: TaskAltRoundedIcon, label: c.completedMeetings },
    { key: "activeRequests", icon: MarkChatUnreadRoundedIcon, label: c.activeRequests },
    { key: "mentorsConnected", icon: Diversity3RoundedIcon, label: c.mentorsConnected },
  ];

  const openRows = openKey && data ? data.records[openKey] : [];
  const openLabel = openKey ? tiles.find((x) => x.key === openKey)?.label : "";

  return (
    <Box>
      <Typography
        sx={{
          fontSize: "0.8rem",
          fontWeight: 800,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "#b05a75",
          mb: 1.25,
        }}
      >
        {c.title}
      </Typography>

      <Box
        sx={{
          display: "grid",
          gap: { xs: 1.5, md: 2 },
          gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" },
        }}
      >
        {tiles.map((tile) => (
          <StatTile
            key={tile.key}
            icon={tile.icon}
            label={tile.label}
            value={data ? data.counts[tile.key] : 0}
            loading={loading || !data}
            selected={openKey === tile.key}
            onSelect={() =>
              setOpenKey((prev) => (prev === tile.key ? null : tile.key))
            }
            controls={PANEL_ID}
          />
        ))}
      </Box>

      <Collapse in={Boolean(openKey)} unmountOnExit>
        <Box
          id={PANEL_ID}
          role="region"
          aria-label={openLabel}
          sx={{
            mt: 1.5,
            p: { xs: 2, md: 2.5 },
            borderRadius: "16px",
            backgroundColor: "#fff",
            border: "1px solid rgba(225,29,106,0.14)",
            boxShadow: "0 10px 28px rgba(159,18,57,0.06)",
          }}
        >
          <Typography sx={{ fontWeight: 700, color: "#4a1528", mb: 0.5 }}>
            {openLabel}
          </Typography>
          {openRows.length === 0 ? (
            <Typography sx={{ color: "#b05a75", fontSize: "0.9rem", py: 1 }}>
              {c.detailEmpty}
            </Typography>
          ) : (
            <Stack divider={<Divider flexItem />}>
              {openRows.map((row) => (
                <DetailRow key={row.id} row={row} />
              ))}
            </Stack>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}
