import React from "react";
import { Avatar, Box, Skeleton, Stack, Typography } from "@mui/material";

import { useLanguage } from "../../i18n/LanguageProvider";
import PageHeader from "../../components/app/PageHeader";
import ContentCard from "../../components/app/ContentCard";
import ListContainer from "../../components/app/ListContainer";
import StatusChip from "../../components/app/StatusChip";

/**
 * `/app/personal-area` — generic user personal area.
 * PLACEHOLDER SHELL ONLY: profile + requests are static placeholders,
 * no data fetching.
 */

// Throwaway demo rows — replace with real requests/meetings data.
const DEMO_ROWS = [
  { id: 1, status: "pending" },
  { id: 2, status: "scheduled" },
];

function RequestRow({ status }) {
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
        <Skeleton variant="circular" width={36} height={36} />
        <Box sx={{ minWidth: 0 }}>
          <Skeleton variant="text" width={140} />
          <Typography sx={{ fontSize: "0.8rem", color: "#b05a75" }}>
            {t.app.common.comingSoon}
          </Typography>
        </Box>
      </Stack>
      <StatusChip status={status} />
    </Stack>
  );
}

export default function PersonalAreaPage() {
  const { t } = useLanguage();
  const c = t.app.personalArea;

  return (
    <Box>
      <PageHeader title={c.title} description={c.description} />

      <Stack spacing={{ xs: 2.5, md: 3 }}>
        {/* Profile summary — placeholder */}
        <ContentCard title={c.profileTitle}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Avatar sx={{ width: 56, height: 56, bgcolor: "rgba(225,29,106,0.12)" }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Skeleton variant="text" width="45%" />
              <Skeleton variant="text" width="70%" />
            </Box>
          </Stack>
          <Typography sx={{ mt: 1.5, color: "#6d3049", fontSize: "0.9rem" }}>
            {c.profileHint}
          </Typography>
        </ContentCard>

        {/* Requests & meetings — demo rows (swap for real data / empty state) */}
        <ContentCard title={c.requestsTitle}>
          <ListContainer
            empty={{ title: c.requestsEmptyTitle, hint: c.requestsEmptyHint }}
          >
            {DEMO_ROWS.map((r) => (
              <RequestRow key={r.id} status={r.status} />
            ))}
          </ListContainer>
        </ContentCard>
      </Stack>
    </Box>
  );
}
