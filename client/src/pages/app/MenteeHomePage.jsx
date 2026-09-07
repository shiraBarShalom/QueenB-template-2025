import React from "react";
import { Box, Button, Chip, Stack, TextField, Typography } from "@mui/material";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded";

import { useLanguage } from "../../i18n/LanguageProvider";
import PageHeader from "../../components/app/PageHeader";
import ContentCard from "../../components/app/ContentCard";
import ListContainer from "../../components/app/ListContainer";

/**
 * `/app` — Mentee Home / Mentor Search.
 * PLACEHOLDER SHELL ONLY: no real search, no data, no matching.
 * The team wires the search box, filters and results list to the API later.
 */
export default function MenteeHomePage() {
  const { t } = useLanguage();
  const c = t.app.menteeHome;
  const searchLabel = t.app.nav.menteeHome;

  return (
    <Box>
      <PageHeader title={c.title} description={c.description} />

      <Stack spacing={{ xs: 2.5, md: 3 }}>
        {/* Search area — placeholder (disabled) */}
        <ContentCard>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              fullWidth
              disabled
              placeholder={c.searchPlaceholder}
              InputProps={{ startAdornment: <SearchRoundedIcon sx={{ mr: 1, color: "#b05a75" }} /> }}
            />
            <Button variant="contained" disabled sx={{ px: 4, flexShrink: 0 }}>
              {searchLabel}
            </Button>
          </Stack>
        </ContentCard>

        {/* Filters — placeholder */}
        <ContentCard title={c.filtersTitle}>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1, mb: 1.5 }}>
            {["", "", ""].map((_, i) => (
              <Chip key={i} label="—" disabled variant="outlined" />
            ))}
          </Stack>
          <Typography sx={{ color: "#6d3049", fontSize: "0.9rem" }}>{c.filtersHint}</Typography>
        </ContentCard>

        {/* Results — empty-state example (swap to `loading` / real items when wired) */}
        <ContentCard title={c.resultsTitle}>
          <ListContainer
            isEmpty
            empty={{ icon: SearchOffRoundedIcon, title: c.emptyTitle, hint: c.emptyHint }}
          />
        </ContentCard>
      </Stack>
    </Box>
  );
}
