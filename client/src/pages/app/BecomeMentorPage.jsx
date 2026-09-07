import React from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import Diversity3RoundedIcon from "@mui/icons-material/Diversity3Rounded";

import { useLanguage } from "../../i18n/LanguageProvider";
import PageHeader from "../../components/app/PageHeader";
import ContentCard from "../../components/app/ContentCard";

/**
 * `/app/become-a-mentor` — placeholder destination for the future
 * mentor-registration flow.
 * PLACEHOLDER SHELL ONLY: no form, no backend. The CTA is disabled.
 */
export default function BecomeMentorPage() {
  const { t } = useLanguage();
  const c = t.app.becomeMentor;

  return (
    <Box>
      <PageHeader title={c.title} description={c.description} />

      <ContentCard sx={{ maxWidth: 640 }}>
        <Stack spacing={2.5} alignItems="flex-start">
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: "16px",
              display: "grid",
              placeItems: "center",
              color: "#e11d6a",
              backgroundColor: "rgba(225,29,106,0.1)",
            }}
          >
            <Diversity3RoundedIcon />
          </Box>
          <Typography sx={{ color: "#6d3049", lineHeight: 1.8 }}>
            {t.app.common.placeholderNote}
          </Typography>
          <Box>
            {/* TODO(mentor-signup): open the real registration flow here. */}
            <Button variant="contained" disabled sx={{ px: 4 }}>
              {c.cta}
            </Button>
            <Typography sx={{ mt: 1, fontSize: "0.85rem", color: "#b05a75" }}>{c.ctaNote}</Typography>
          </Box>
        </Stack>
      </ContentCard>
    </Box>
  );
}
