import React, { useMemo, useState } from "react";
import { Box, Button, IconButton, Stack, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";

import { useLanguage } from "../../../i18n/LanguageProvider";
import fillTemplate from "../../../utils/fillTemplate";
import {
  DAY_MS,
  formatDayLabel,
  formatDayShort,
  formatTime,
  generateDayTimes,
  isPastStart,
  todayStart,
} from "../../../utils/slotTime";

/**
 * Day + time chooser for Part 3 (mentor proposes 2–3 meeting times).
 *
 * Controlled: `slots` is an array of { startMs } owned by the page; the picker
 * only toggles entries via `onChange`. It does NOT talk to the API and does not
 * know the state machine — it just produces valid future start instants. The
 * page turns them into { startTime, endTime } and submits.
 *
 * Selected state is shown with a 2px border + a check icon + `aria-pressed`, so
 * it never depends on colour alone.
 */

const MAX_DAYS_AHEAD = 56;

function DayStrip({ activeDayMs, onSelectDay, disabled }) {
  const { t, lang, dir } = useLanguage();
  const c = t.app.mentorArea.proposeSlots;
  const theme = useTheme();
  const isNarrow = useMediaQuery(theme.breakpoints.down("sm"));
  const windowSize = isNarrow ? 4 : 7;

  const [offset, setOffset] = useState(0);
  const maxOffset = Math.max(0, MAX_DAYS_AHEAD - windowSize + 1);
  const clamped = Math.min(offset, maxOffset);
  const windowStart = todayStart() + clamped * DAY_MS;
  const days = Array.from({ length: windowSize }, (_, i) => windowStart + i * DAY_MS);

  const canPrev = clamped > 0 && !disabled;
  const canNext = clamped < maxOffset && !disabled;

  const page = (delta) => {
    const next = Math.min(maxOffset, Math.max(0, clamped + delta));
    setOffset(next);
    onSelectDay(todayStart() + next * DAY_MS);
  };

  const PrevIcon = dir === "rtl" ? ChevronRightRoundedIcon : ChevronLeftRoundedIcon;
  const NextIcon = dir === "rtl" ? ChevronLeftRoundedIcon : ChevronRightRoundedIcon;

  return (
    <Box role="group" aria-label={c.chooseDay}>
      <Typography
        component="h3"
        sx={{ fontSize: "0.95rem", fontWeight: 700, color: "#4a1528", mb: 1 }}
      >
        {c.chooseDay}
      </Typography>

      <Stack direction="row" spacing={1} alignItems="stretch">
        <IconButton
          aria-label={c.prevDays}
          onClick={() => page(-windowSize)}
          disabled={!canPrev}
          sx={{ alignSelf: "center", color: "#9f1239" }}
        >
          <PrevIcon />
        </IconButton>

        <Box
          sx={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: `repeat(${windowSize}, 1fr)`,
            gap: 1,
          }}
        >
          {days.map((ms) => {
            const active = ms === activeDayMs;
            const short = formatDayShort(ms, lang);
            return (
              <Button
                key={ms}
                onClick={() => onSelectDay(ms)}
                disabled={disabled}
                aria-pressed={active}
                aria-label={formatDayLabel(ms, lang)}
                sx={{
                  flexDirection: "column",
                  minHeight: 64,
                  px: 0.5,
                  borderRadius: "12px",
                  border: active
                    ? "2px solid #e11d6a"
                    : "1px solid rgba(225,29,106,0.24)",
                  backgroundColor: active ? "rgba(225,29,106,0.10)" : "#fff",
                  color: active ? "#9f1239" : "#6d3049",
                }}
              >
                <Box component="span" sx={{ fontSize: "0.72rem", fontWeight: 600 }}>
                  {short.weekday}
                </Box>
                <Box component="span" sx={{ fontSize: "1.05rem", fontWeight: 800, lineHeight: 1.2 }}>
                  {short.day}
                </Box>
                {active && <CheckRoundedIcon aria-hidden sx={{ fontSize: 14, mt: 0.25 }} />}
              </Button>
            );
          })}
        </Box>

        <IconButton
          aria-label={c.nextDays}
          onClick={() => page(windowSize)}
          disabled={!canNext}
          sx={{ alignSelf: "center", color: "#9f1239" }}
        >
          <NextIcon />
        </IconButton>
      </Stack>

      <Typography
        aria-live="polite"
        sx={{ mt: 1.25, fontWeight: 700, color: "#4a1528" }}
      >
        {formatDayLabel(activeDayMs, lang)}
      </Typography>
    </Box>
  );
}

function TimeOptionsList({ activeDayMs, selectedSet, atMax, disabled, onToggle }) {
  const { t, lang } = useLanguage();
  const c = t.app.mentorArea.proposeSlots;

  const times = useMemo(() => generateDayTimes(activeDayMs), [activeDayMs]);
  const anyFuture = times.some((ms) => !isPastStart(ms));

  return (
    <Box
      role="group"
      aria-label={fillTemplate(c.timesOn, { day: formatDayLabel(activeDayMs, lang) })}
    >
      {!anyFuture ? (
        <Typography sx={{ color: "#6d3049", py: 2 }}>{c.noTimes}</Typography>
      ) : (
        <Box
          sx={{
            maxHeight: 288,
            overflowY: "auto",
            pr: 0.5,
            display: "grid",
            gap: 1,
            gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))",
          }}
        >
          {times.map((ms) => {
            const past = isPastStart(ms);
            const selected = selectedSet.has(ms);
            const label = formatTime(ms, lang);
            const blocked = disabled || past || (atMax && !selected);
            const ariaLabel = past
              ? fillTemplate(c.timePast, { time: label })
              : selected
              ? fillTemplate(c.timeSelected, { time: label })
              : fillTemplate(c.timeSelect, { time: label });

            return (
              <Button
                key={ms}
                onClick={() => onToggle(ms)}
                disabled={blocked}
                aria-pressed={selected}
                aria-label={ariaLabel}
                startIcon={selected ? <CheckRoundedIcon /> : null}
                sx={{
                  minHeight: 44,
                  borderRadius: "12px",
                  fontWeight: 700,
                  border: selected
                    ? "2px solid #e11d6a"
                    : "1px solid rgba(225,29,106,0.24)",
                  backgroundColor: selected ? "rgba(225,29,106,0.12)" : "#fff",
                  color: selected ? "#9f1239" : "#4a1528",
                }}
              >
                {label}
              </Button>
            );
          })}
        </Box>
      )}

      {atMax && (
        <Typography
          role="status"
          sx={{ mt: 1, fontSize: "0.85rem", fontWeight: 600, color: "#9a3412" }}
        >
          {fillTemplate(c.maxReached, { max: 3 })}
        </Typography>
      )}
    </Box>
  );
}

export default function SlotPicker({
  slots,
  onChange,
  maxSlots = 3,
  disabled = false,
}) {
  const [activeDayMs, setActiveDayMs] = useState(() => todayStart());

  const selectedSet = useMemo(
    () => new Set(slots.map((s) => s.startMs)),
    [slots]
  );

  const toggleTime = (ms) => {
    if (disabled) return;
    if (selectedSet.has(ms)) {
      onChange(slots.filter((s) => s.startMs !== ms));
      return;
    }
    if (slots.length >= maxSlots || isPastStart(ms)) return;
    onChange([...slots, { startMs: ms }]);
  };

  return (
    <Stack spacing={2.5}>
      <DayStrip
        activeDayMs={activeDayMs}
        onSelectDay={setActiveDayMs}
        disabled={disabled}
      />
      <TimeOptionsList
        activeDayMs={activeDayMs}
        selectedSet={selectedSet}
        atMax={slots.length >= maxSlots}
        disabled={disabled}
        onToggle={toggleTime}
      />
    </Stack>
  );
}
