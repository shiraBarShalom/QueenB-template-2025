import React from "react";
import { Link as RouterLink } from "react-router-dom";
import { Avatar, Box, Button, Chip, Stack, Typography } from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";

import { useLanguage } from "../../../i18n/LanguageProvider";
import { mentorProposeSlotsPath } from "../../../constants/routes";
import StatusChip from "../StatusChip";

/**
 * One incoming request (status WAITING_FOR_MENTOR_SLOTS) in the Mentor Area.
 *
 * Shows only fields that already exist on the mentee's User row and that help
 * the mentor decide — name, role, workplace, experience, technologies, and when
 * the request was sent. Contact details (email / phone) are deliberately NOT
 * shown for a request that hasn't been accepted yet.
 *
 * The two actions map 1:1 to the state machine:
 *   Decline  -> parent opens the confirm dialog -> POST /reject (terminal)
 *   Propose  -> navigates to the Part 3 entry point; no transition happens here
 */
function fill(template, values) {
  return Object.keys(values).reduce(
    (out, key) => out.replace(`{${key}}`, values[key]),
    template
  );
}

function initials(name) {
  if (!name) return "";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function IncomingRequestCard({ request, busy = false, onReject }) {
  const { t, lang } = useLanguage();
  const c = t.app.mentorArea.incoming;
  const mentee = request.mentee || {};

  const roleLine = [mentee.jobTitle, mentee.workplace].filter(Boolean).join(" · ");

  let submitted = "";
  try {
    submitted = new Date(request.createdAt).toLocaleDateString(lang, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    submitted = new Date(request.createdAt).toISOString().slice(0, 10);
  }

  return (
    <Box
      component="article"
      sx={{
        p: { xs: 2, md: 2.25 },
        borderRadius: "16px",
        border: "1px solid rgba(225,29,106,0.14)",
        backgroundColor: "#fff",
      }}
    >
      <Stack
        direction="row"
        spacing={1.5}
        alignItems="flex-start"
        justifyContent="space-between"
      >
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
          <Avatar
            src={mentee.profileImageUrl || undefined}
            alt={fill(c.avatarAlt, { name: mentee.fullName || "" })}
            sx={{ width: 44, height: 44, bgcolor: "rgba(225,29,106,0.12)", color: "#9f1239", fontWeight: 700 }}
          >
            {initials(mentee.fullName)}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, color: "#4a1528" }} noWrap>
              {mentee.fullName}
            </Typography>
            {roleLine && (
              <Typography sx={{ fontSize: "0.85rem", color: "#6d3049" }} noWrap>
                {roleLine}
              </Typography>
            )}
          </Box>
        </Stack>
        <StatusChip status="pending" />
      </Stack>

      {(mentee.yearsOfExperience != null ||
        (mentee.technologies && mentee.technologies.length > 0)) && (
        <Stack
          direction="row"
          spacing={1}
          sx={{ flexWrap: "wrap", gap: 1, mt: 1.5 }}
          alignItems="center"
        >
          {mentee.yearsOfExperience != null && (
            <Chip
              size="small"
              variant="outlined"
              label={fill(c.yearsExperience, { count: mentee.yearsOfExperience })}
              sx={{ borderColor: "rgba(225,29,106,0.28)", color: "#6d3049" }}
            />
          )}
          {(mentee.technologies || []).map((tech) => (
            <Chip
              key={tech.id}
              size="small"
              label={tech.name}
              sx={{ backgroundColor: "rgba(225,29,106,0.10)", color: "#9f1239", fontWeight: 600 }}
            />
          ))}
        </Stack>
      )}

      <Typography sx={{ mt: 1.5, fontSize: "0.8rem", color: "#b05a75" }}>
        {fill(c.submittedAt, { date: submitted })}
      </Typography>

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{ mt: 2 }}
        justifyContent="flex-end"
      >
        <Button
          onClick={() => onReject(request)}
          disabled={busy}
          variant="outlined"
          color="error"
          startIcon={<CloseRoundedIcon />}
          sx={{ minHeight: 44, fontWeight: 700 }}
        >
          {c.rejectCta}
        </Button>
        <Button
          component={RouterLink}
          to={mentorProposeSlotsPath(request.id)}
          variant="contained"
          startIcon={<ScheduleRoundedIcon />}
          sx={{ minHeight: 44, fontWeight: 700 }}
        >
          {c.proposeCta}
        </Button>
      </Stack>
    </Box>
  );
}
