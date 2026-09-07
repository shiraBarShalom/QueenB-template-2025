import React, { useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import axios from "axios";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import { colors, fonts, radii, shadows } from "../../theme/tokens";
import { useLanguage } from "../../i18n/LanguageProvider";
import { useCurrentUser } from "../../auth/useCurrentUser";
import { mentorProfilePath } from "../../constants/routes";
import PageHeader from "../../components/app/PageHeader";
import StatusChip from "../../components/app/StatusChip";
import {
  buildOpenRequestByMentorUserId,
  openRequestUiKind,
} from "../../utils/openRequestStatus";

/**
 * `/app` — Mentee Home.
 *
 * Mentor discovery with client-side search/filters. Cards keep View Profile;
 * an optional status chip reflects an existing open request with that mentor
 * (one fetch of GET /api/mentees/:id/requests, not per-card open checks).
 *
 * Filters use existing list fields plus spokenLanguages (human languages).
 * techStack stays programming languages/technologies — never mixed with spoken.
 */

/** Canonical spoken-language catalog for the MVP filter (matches seed/API names). */
const SPOKEN_LANGUAGE_OPTIONS = ["Hebrew", "Arabic", "English"];

const EXPERIENCE_OPTIONS = [1, 3, 5, 8, 10];

const EMPTY_FILTERS = {
  search: "",
  company: "",
  technology: "",
  topic: "",
  minExperience: "",
  spokenLanguage: "",
};

function fill(template, vars) {
  return Object.entries(vars).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template
  );
}

function splitCsv(value) {
  return (value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
}

function matchesMentor(mentor, filters) {
  const search = filters.search.trim().toLowerCase();
  if (search) {
    const haystack = [mentor.username, mentor.jobTitle, mentor.company]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(search)) return false;
  }

  if (filters.company && mentor.company !== filters.company) return false;

  if (filters.technology) {
    const techs = splitCsv(mentor.techStack);
    if (!techs.includes(filters.technology)) return false;
  }

  if (filters.topic) {
    const topics = splitCsv(mentor.adviceTopics);
    if (!topics.includes(filters.topic)) return false;
  }

  if (filters.minExperience !== "") {
    const minYears = Number(filters.minExperience);
    if (
      mentor.yearsOfExperience == null ||
      mentor.yearsOfExperience < minYears
    ) {
      return false;
    }
  }

  if (filters.spokenLanguage) {
    const spoken = mentor.spokenLanguages || [];
    if (!spoken.includes(filters.spokenLanguage)) return false;
  }

  return true;
}

function MentorCard({ mentor, copy, openRequest }) {
  const initials = (mentor.username || "?")
    .split(/[\s_]+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const topics = splitCsv(mentor.adviceTopics).slice(0, 3);

  const experienceText =
    mentor.yearsOfExperience != null
      ? fill(copy.card.yearsExperience, { count: mentor.yearsOfExperience })
      : copy.card.experienceUnknown;

  const meetingText =
    mentor.meetingDurationMins != null
      ? ` · ${fill(copy.card.meetingMins, {
          count: mentor.meetingDurationMins,
        })}`
      : "";

  const requestKind = openRequestUiKind(openRequest?.status);

  return (
    <Box
      component="article"
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
        p: { xs: 2.25, sm: 2.75 },
        height: "100%",
        borderRadius: `${radii.lg}px`,
        background: colors.overlay,
        border: `1px solid ${colors.border}`,
        backdropFilter: "blur(10px)",
        boxShadow: shadows.soft,
        transition: "transform 180ms ease, box-shadow 180ms ease",
        animation: "mentorMeFadeUp 600ms ease-out both",
        "&:hover": {
          transform: "translateY(-3px)",
          boxShadow: shadows.medium,
        },
      }}
    >
      <Stack direction="row" spacing={1.75} alignItems="center">
        <Avatar
          src={mentor.profilePictureUrl || undefined}
          alt={mentor.username}
          sx={{
            width: 56,
            height: 56,
            bgcolor: colors.pink[500],
            fontFamily: fonts.display,
            fontWeight: 700,
          }}
        >
          {initials}
        </Avatar>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
          >
            <Typography
              component="h2"
              sx={{
                fontFamily: fonts.display,
                fontWeight: 700,
                fontSize: "1.25rem",
                lineHeight: 1.2,
                color: colors.pink[700],
              }}
            >
              {mentor.username}
            </Typography>
            {requestKind === "pending" && (
              <StatusChip
                status="pending"
                label={copy.card.requestAlreadySent}
                sx={{
                  // Discovery-only: keep shared pending amber elsewhere.
                  color: "#a16207",
                  backgroundColor: "rgba(234, 179, 8, 0.22)",
                }}
              />
            )}
            {requestKind === "scheduled" && (
              <StatusChip
                status="scheduled"
                label={copy.card.meetingScheduled}
              />
            )}
          </Stack>
          <Typography variant="body2" color="text.secondary" noWrap>
            {[mentor.jobTitle, mentor.company].filter(Boolean).join(" · ") ||
              copy.card.mentorFallback}
          </Typography>
        </Box>
      </Stack>

      <Typography variant="body2" color="text.secondary">
        {experienceText}
        {meetingText}
      </Typography>

      {mentor.techStack && (
        <Typography variant="body2" sx={{ color: colors.text.primary }}>
          {mentor.techStack}
        </Typography>
      )}

      {topics.length > 0 && (
        <Stack direction="row" flexWrap="wrap" useFlexGap gap={0.75}>
          {topics.map((topic) => (
            <Chip key={topic} label={topic} size="small" variant="outlined" />
          ))}
        </Stack>
      )}

      <Box sx={{ flexGrow: 1 }} />

      <Button
        component={RouterLink}
        to={mentorProfilePath(mentor.userId)}
        variant="contained"
        fullWidth
      >
        {copy.card.viewProfile}
      </Button>
    </Box>
  );
}

export default function MenteeHomePage() {
  const { t } = useLanguage();
  const copy = t.mentors;
  const homeCopy = t.app.menteeHome;
  const filterCopy = homeCopy.filters;
  const { id: menteeId } = useCurrentUser();

  const [mentors, setMentors] = useState([]);
  const [openByMentorUserId, setOpenByMentorUserId] = useState(() => new Map());
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState("");
  const [serverError, setServerError] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  useEffect(() => {
    let cancelled = false;

    async function loadMentors() {
      setLoading(true);
      setErrorKey("");
      setServerError("");

      try {
        // Mentors list + one mentee-requests fetch (not per card). Scheduling
        // projection omits mentor userId / mentorProfileId, so it cannot map
        // chips onto discovery cards — requests include both.
        const mentorsPromise = axios.get("/api/mentors");
        const requestsPromise = menteeId
          ? axios.get(`/api/mentees/${menteeId}/requests`).catch(() => null)
          : Promise.resolve(null);

        const [mentorsResponse, requestsResponse] = await Promise.all([
          mentorsPromise,
          requestsPromise,
        ]);

        if (cancelled) return;

        const list = mentorsResponse.data?.data ?? [];
        setMentors(Array.isArray(list) ? list : []);

        const requests = requestsResponse?.data?.data;
        setOpenByMentorUserId(
          buildOpenRequestByMentorUserId(Array.isArray(requests) ? requests : [])
        );
      } catch (err) {
        if (!cancelled) {
          setErrorKey("load");
          setServerError(err.response?.data?.message || "");
          setOpenByMentorUserId(new Map());
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadMentors();
    return () => {
      cancelled = true;
    };
  }, [menteeId]);

  const companyOptions = useMemo(
    () => uniqueSorted(mentors.map((m) => m.company)),
    [mentors]
  );

  const technologyOptions = useMemo(
    () => uniqueSorted(mentors.flatMap((m) => splitCsv(m.techStack))),
    [mentors]
  );

  const topicOptions = useMemo(
    () => uniqueSorted(mentors.flatMap((m) => splitCsv(m.adviceTopics))),
    [mentors]
  );

  const filteredMentors = useMemo(
    () => mentors.filter((mentor) => matchesMentor(mentor, filters)),
    [mentors, filters]
  );

  const filtersActive = useMemo(
    () => Object.values(filters).some((value) => String(value).trim() !== ""),
    [filters]
  );

  const errorText = serverError || (errorKey === "load" ? copy.loadError : "");

  function updateFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
  }

  function spokenLabel(canonicalName) {
    return filterCopy.spokenLanguageNames?.[canonicalName] || canonicalName;
  }

  const selectSx = {
    minWidth: { xs: "100%", sm: 160 },
    bgcolor: colors.overlay,
  };

  return (
    <Box>
      <PageHeader title={copy.title} description={copy.subtitle} />

      {!loading && !errorText && mentors.length > 0 && (
        <Box
          sx={{
            mb: 3,
            p: { xs: 2, sm: 2.5 },
            borderRadius: `${radii.lg}px`,
            background: colors.overlay,
            border: `1px solid ${colors.border}`,
          }}
        >
          <Typography
            sx={{
              fontFamily: fonts.display,
              fontWeight: 700,
              color: colors.pink[700],
              mb: 1.75,
            }}
          >
            {homeCopy.filtersTitle}
          </Typography>

          <Stack spacing={2}>
            <TextField
              fullWidth
              size="small"
              value={filters.search}
              onChange={(e) => updateFilter("search", e.target.value)}
              placeholder={homeCopy.searchPlaceholder}
              inputProps={{ "aria-label": homeCopy.searchPlaceholder }}
              sx={{ bgcolor: colors.white }}
            />

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, 1fr)",
                  md: "repeat(3, 1fr)",
                },
                gap: 1.5,
              }}
            >
              <FormControl size="small" sx={selectSx}>
                <InputLabel id="filter-company-label">
                  {filterCopy.company}
                </InputLabel>
                <Select
                  labelId="filter-company-label"
                  label={filterCopy.company}
                  value={filters.company}
                  onChange={(e) => updateFilter("company", e.target.value)}
                >
                  <MenuItem value="">{filterCopy.companyAny}</MenuItem>
                  {companyOptions.map((company) => (
                    <MenuItem key={company} value={company}>
                      {company}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={selectSx}>
                <InputLabel id="filter-tech-label">
                  {filterCopy.technology}
                </InputLabel>
                <Select
                  labelId="filter-tech-label"
                  label={filterCopy.technology}
                  value={filters.technology}
                  onChange={(e) => updateFilter("technology", e.target.value)}
                >
                  <MenuItem value="">{filterCopy.technologyAny}</MenuItem>
                  {technologyOptions.map((tech) => (
                    <MenuItem key={tech} value={tech}>
                      {tech}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={selectSx}>
                <InputLabel id="filter-topic-label">
                  {filterCopy.topic}
                </InputLabel>
                <Select
                  labelId="filter-topic-label"
                  label={filterCopy.topic}
                  value={filters.topic}
                  onChange={(e) => updateFilter("topic", e.target.value)}
                >
                  <MenuItem value="">{filterCopy.topicAny}</MenuItem>
                  {topicOptions.map((topic) => (
                    <MenuItem key={topic} value={topic}>
                      {topic}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={selectSx}>
                <InputLabel id="filter-experience-label">
                  {filterCopy.experience}
                </InputLabel>
                <Select
                  labelId="filter-experience-label"
                  label={filterCopy.experience}
                  value={filters.minExperience}
                  onChange={(e) =>
                    updateFilter("minExperience", e.target.value)
                  }
                >
                  <MenuItem value="">{filterCopy.experienceAny}</MenuItem>
                  {EXPERIENCE_OPTIONS.map((years) => (
                    <MenuItem key={years} value={String(years)}>
                      {fill(filterCopy.experienceYears, { count: years })}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={selectSx}>
                <InputLabel id="filter-spoken-label">
                  {filterCopy.spokenLanguage}
                </InputLabel>
                <Select
                  labelId="filter-spoken-label"
                  label={filterCopy.spokenLanguage}
                  value={filters.spokenLanguage}
                  onChange={(e) =>
                    updateFilter("spokenLanguage", e.target.value)
                  }
                >
                  <MenuItem value="">{filterCopy.spokenLanguageAny}</MenuItem>
                  {SPOKEN_LANGUAGE_OPTIONS.map((lang) => (
                    <MenuItem key={lang} value={lang}>
                      {spokenLabel(lang)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            {filtersActive && (
              <Box>
                <Button variant="text" onClick={clearFilters}>
                  {homeCopy.clearFilters}
                </Button>
              </Box>
            )}
          </Stack>
        </Box>
      )}

      {loading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {!loading && errorText && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {errorText}
        </Alert>
      )}

      {!loading && !errorText && mentors.length === 0 && (
        <Alert severity="info">
          <Typography fontWeight={700}>{homeCopy.emptyTitle}</Typography>
          <Typography variant="body2">{homeCopy.emptyHint}</Typography>
        </Alert>
      )}

      {!loading &&
        !errorText &&
        mentors.length > 0 &&
        filteredMentors.length === 0 && (
          <Alert severity="info">
            <Typography fontWeight={700}>{homeCopy.noMatchesTitle}</Typography>
            <Typography variant="body2">{homeCopy.noMatchesHint}</Typography>
          </Alert>
        )}

      {!loading && !errorText && filteredMentors.length > 0 && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, 1fr)",
              md: "repeat(3, 1fr)",
            },
            gap: 2.5,
          }}
        >
          {filteredMentors.map((mentor) => (
            <MentorCard
              key={mentor.userId}
              mentor={mentor}
              copy={copy}
              openRequest={openByMentorUserId.get(mentor.userId) || null}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
