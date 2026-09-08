import React from "react";
import { Avatar, Box, Button, Chip, Stack, Typography } from "@mui/material";
import EditRoundedIcon from "@mui/icons-material/EditRounded";

import { useLanguage } from "../../i18n/LanguageProvider";
import ContentCard from "./ContentCard";

/**
 * Read view of the signed-in user's real account details (from GET
 * /api/users/me). "Edit profile" opens EditProfileDialog, which persists via
 * PATCH /api/users/me. Nothing here is cosmetic — every value is a stored
 * column.
 */
function initialsOf(name) {
  return (name || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function Field({ label, value, notSet }) {
  return (
    <Box>
      <Typography
        sx={{
          fontSize: "0.72rem",
          fontWeight: 800,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "#b05a75",
          mb: 0.25,
        }}
      >
        {label}
      </Typography>
      <Typography sx={{ color: value ? "#4a1528" : "#b05a75", wordBreak: "break-word" }}>
        {value || notSet}
      </Typography>
    </Box>
  );
}

export default function PersonalProfileCard({ user, onEdit }) {
  const { t } = useLanguage();
  const c = t.app.personalArea.account;
  const p = user?.profile || {};

  const editAction = (
    <Button
      size="small"
      variant="outlined"
      startIcon={<EditRoundedIcon fontSize="small" />}
      onClick={onEdit}
      sx={{ fontWeight: 700, whiteSpace: "nowrap" }}
    >
      {c.editCta}
    </Button>
  );

  const tech = Array.isArray(user?.technologies) ? user.technologies : [];
  const spoken = Array.isArray(user?.spokenLanguages) ? user.spokenLanguages : [];

  return (
    <ContentCard title={c.title} action={editAction}>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2.5 }}>
        <Avatar
          src={p.profileImageUrl || undefined}
          sx={{ width: 60, height: 60, bgcolor: "#e11d6a", color: "#fff", fontWeight: 700 }}
        >
          {initialsOf(user?.fullName)}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: "1.15rem", color: "#4a1528" }}>
            {user?.fullName}
          </Typography>
          <Typography sx={{ color: "#6d3049", fontSize: "0.92rem", wordBreak: "break-word" }}>
            {user?.email}
          </Typography>
        </Box>
      </Stack>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
        }}
      >
        <Field label={c.jobTitle} value={p.jobTitle} notSet={c.notSet} />
        <Field label={c.workplace} value={p.workplace || p.company} notSet={c.notSet} />
        <Field
          label={c.yearsOfExperience}
          value={
            p.yearsOfExperience === null || p.yearsOfExperience === undefined
              ? ""
              : String(p.yearsOfExperience)
          }
          notSet={c.notSet}
        />
        <Field label={c.phoneNumber} value={p.phoneNumber} notSet={c.notSet} />
        <Field label={c.linkedinUrl} value={p.linkedinUrl} notSet={c.notSet} />
        <Field label={c.githubUrl} value={p.githubUrl} notSet={c.notSet} />
      </Box>

      {(tech.length > 0 || spoken.length > 0) && (
        <Stack spacing={1.5} sx={{ mt: 2.5 }}>
          {tech.length > 0 && (
            <Box>
              <Typography
                sx={{
                  fontSize: "0.72rem",
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "#b05a75",
                  mb: 0.75,
                }}
              >
                {c.technologies}
              </Typography>
              <Stack direction="row" flexWrap="wrap" useFlexGap gap={0.75}>
                {tech.map((name) => (
                  <Chip key={name} label={name} size="small" variant="outlined" />
                ))}
              </Stack>
            </Box>
          )}
          {spoken.length > 0 && (
            <Box>
              <Typography
                sx={{
                  fontSize: "0.72rem",
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "#b05a75",
                  mb: 0.75,
                }}
              >
                {c.spokenLanguages}
              </Typography>
              <Stack direction="row" flexWrap="wrap" useFlexGap gap={0.75}>
                {spoken.map((name) => (
                  <Chip key={name} label={name} size="small" variant="outlined" />
                ))}
              </Stack>
            </Box>
          )}
        </Stack>
      )}
    </ContentCard>
  );
}
