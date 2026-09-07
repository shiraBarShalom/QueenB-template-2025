import React from "react";
import { Avatar, Box, Skeleton, Stack, Typography } from "@mui/material";

import { useLanguage } from "../../i18n/LanguageProvider";
import PageHeader from "../../components/app/PageHeader";
import ContentCard from "../../components/app/ContentCard";
import MenteeSchedulingSection from "../../components/app/mentee/MenteeSchedulingSection";

/**
 * `/app/personal-area` — mentee personal hub.
 * Profile summary remains a lightweight placeholder; scheduling is fully wired
 * via MenteeSchedulingSection (pending / scheduled / past).
 */

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

        {/* Scheduling — self-contained: pending, scheduled, past/cancelled. */}
        <MenteeSchedulingSection />
      </Stack>
    </Box>
  );
}
