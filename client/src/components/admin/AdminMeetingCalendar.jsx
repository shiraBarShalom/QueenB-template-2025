import React, { useMemo, useState } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { REPORT_STATUSES, statusMeta } from "../../admin/meetingStatus";
import { useLanguage } from "../../i18n/LanguageProvider";

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function sameDay(left, right) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export default function AdminMeetingCalendar({ meetings }) {
  const navigate = useNavigate();
  const { t, locale } = useLanguage();
  const admin = t.admin;
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    new Date(2026, 8, 6 + index).toLocaleDateString(locale, { weekday: "short" })
  );

  const days = useMemo(() => {
    const first = startOfMonth(month);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, [month]);

  const meetingsByDay = useMemo(() => {
    const map = new Map();
    for (const meeting of meetings) {
      if (!meeting.scheduledStart) continue;
      const key = new Date(meeting.scheduledStart).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(meeting);
    }
    return map;
  }, [meetings]);

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
        <Button onClick={() => setMonth((current) => addMonths(current, -1))}>{admin.previous}</Button>
        <Typography variant="h6" sx={{ flex: 1, textAlign: { sm: "center" } }}>
          {month.toLocaleString(locale, { month: "long", year: "numeric" })}
        </Typography>
        <Button onClick={() => setMonth((current) => addMonths(current, 1))}>{admin.next}</Button>
      </Stack>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {REPORT_STATUSES.map((item) => (
          <Typography key={item.value} variant="caption" sx={{ color: item.color, fontWeight: 700 }}>
            ● {admin.statuses[item.value] || item.label}
          </Typography>
        ))}
      </Stack>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gap: 0.75,
        }}
      >
        {weekdays.map((day) => (
          <Typography key={day} variant="caption" sx={{ fontWeight: 700, px: 0.5 }}>
            {day}
          </Typography>
        ))}
        {days.map((day) => {
          const inMonth = day.getMonth() === month.getMonth();
          const items = meetingsByDay.get(day.toDateString()) || [];
          return (
            <Box
              key={day.toISOString()}
              sx={{
                minHeight: 92,
                p: 0.75,
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
                opacity: inMonth ? 1 : 0.45,
                bgcolor: sameDay(day, new Date()) ? "rgba(225, 29, 106, 0.06)" : "background.paper",
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 700 }}>
                {day.getDate()}
              </Typography>
              <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                {items.map((meeting) => {
                  const meta = statusMeta(meeting.status);
                  return (
                    <Box
                      key={meeting.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/admin/meetings/${meeting.requestId}`)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") navigate(`/admin/meetings/${meeting.requestId}`);
                      }}
                      sx={{
                        px: 0.5,
                        py: 0.25,
                        borderRadius: 0.5,
                        backgroundColor: meta.background,
                        color: meta.color,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {meeting.mentee?.displayName} / {meeting.mentor?.displayName}
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          );
        })}
      </Box>
    </Stack>
  );
}
