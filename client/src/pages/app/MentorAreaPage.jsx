import React from "react";
import { Avatar, Box, Skeleton, Stack, Typography } from "@mui/material";
import EventRoundedIcon from "@mui/icons-material/EventRounded";

import { useLanguage } from "../../i18n/LanguageProvider";
import PageHeader from "../../components/app/PageHeader";
import ContentCard from "../../components/app/ContentCard";
import ListContainer from "../../components/app/ListContainer";
import EmptyState from "../../components/app/EmptyState";
import StatusChip from "../../components/app/StatusChip";

/**
 * `/app/mentor-area` — base page for mentor-specific functionality.
 * PLACEHOLDER SHELL ONLY: no scheduling, no availability logic, no data.
 */

// Throwaway demo row — replace with real incoming-request data.
const DEMO_REQUESTS = [{ id: 1, status: "pending" }];

function IncomingRequestRow({ status }) {
  const { t } = useLanguage();
  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      spacing={2}
      sx={{
        p: 1.75,
        borderRadius: "14px",
        border: "1px solid rgba(225,29,106,0.12)",
        backgroundColor: "#fff",
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
        <Avatar sx={{ width: 36, height: 36, bgcolor: "rgba(225,29,106,0.12)" }} />
        <Box sx={{ minWidth: 0 }}>
          <Skeleton variant="text" width={150} />
          <Typography sx={{ fontSize: "0.8rem", color: "#b05a75" }}>
            {t.app.common.comingSoon}
          </Typography>
        </Box>
      </Stack>
      <StatusChip status={status} />
    </Stack>
  );
}

export default function MentorAreaPage() {
  const { t } = useLanguage();
  const c = t.app.mentorArea;

  return (
    <Box>
      <PageHeader title={c.title} description={c.description} />

      <Stack spacing={{ xs: 2.5, md: 3 }}>
        {/* Mentor profile summary — placeholder */}
        <ContentCard title={c.profileTitle}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Avatar sx={{ width: 56, height: 56, bgcolor: "rgba(225,29,106,0.12)" }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Skeleton variant="text" width="40%" />
              <Skeleton variant="text" width="65%" />
            </Box>
          </Stack>
          <Typography sx={{ mt: 1.5, color: "#6d3049", fontSize: "0.9rem" }}>
            {c.profileHint}
          </Typography>
        </ContentCard>

        {/* Incoming requests — demo row (swap for real data / empty state) */}
        <ContentCard title={c.requestsTitle}>
          <ListContainer empty={{ title: c.requestsEmptyTitle, hint: c.requestsEmptyHint }}>
            {DEMO_REQUESTS.map((r) => (
              <IncomingRequestRow key={r.id} status={r.status} />
            ))}
          </ListContainer>
        </ContentCard>

        {/* Meetings & availability — not built yet */}
        <ContentCard title={c.scheduleTitle}>
          <EmptyState
            icon={EventRoundedIcon}
            title={t.app.common.comingSoon}
            hint={c.scheduleHint}
          />
        </ContentCard>
      </Stack>
    </Box>
  );
}
