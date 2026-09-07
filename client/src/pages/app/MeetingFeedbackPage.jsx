import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import {
  Alert,
  Box,
  Button,
  Card,
  CircularProgress,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  Rating,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import StarBorderRoundedIcon from "@mui/icons-material/StarBorderRounded";
import FavoriteRoundedIcon from "@mui/icons-material/FavoriteRounded";

import { useLanguage } from "../../i18n/LanguageProvider";
import { useCurrentUser } from "../../auth/useCurrentUser";
import { ROUTES } from "../../constants/routes";
import { formatDateTimeLabel } from "../../utils/slotTime";
import MatchQueensLogo from "../../components/MatchQueensLogo";
import {
  fetchMeetingFeedback,
  submitMeetingFeedback,
} from "../../api/meetingFeedback";

/**
 * `/app/meetings/:meetingId/feedback` — the focused post-meeting feedback page.
 *
 * Rendered OUTSIDE <AppLayout> (see App.js): no app nav, just the centred logo,
 * a heading and one small card. The user arrives here from her POST_MEETING_CHECK
 * notification only to answer:
 *   1. "האם הפגישה התקיימה?"        -> stored as MeetingOutcomeConfirmation
 *   2a. no  -> "למה?" (reason + optional note)
 *   2b. yes -> short feedback (rating / helpful / [mentee] continue / comment)
 * and everything is written to the dedicated Feedback table via the backend.
 *
 * The frontend owns NO state that matters: authorisation, "already submitted",
 * the reason list and the status transition all come from the server. A 403 / 404
 * / 409 is shown honestly, never faked into a success.
 */

const PINK = "#e11d6a";
const INK = "#4a1528";
const MUTED = "#6d3049";

// Local step within the form once the meeting is confirmed open for feedback.
const STEP = { ASK: "ask", NO: "no", YES: "yes" };

function FocusShell({ children }) {
  const { dir, fonts, theme } = useLanguage();
  return (
    <ThemeProvider theme={theme}>
      <Box
        dir={dir}
        sx={{
          "--mq-font-body": fonts.body,
          "--mq-font-display": fonts.display,
          direction: dir,
          fontFamily: "var(--mq-font-body)",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          px: { xs: 2, sm: 3 },
          py: { xs: 5, sm: 8 },
          color: INK,
          background: `
            radial-gradient(ellipse 80% 55% at 12% 8%, rgba(244,114,182,0.20), transparent 60%),
            radial-gradient(ellipse 70% 55% at 92% 100%, rgba(251,113,133,0.16), transparent 55%),
            linear-gradient(170deg, #fffdfb 0%, #fff1f5 55%, #fce7f3 100%)
          `,
        }}
      >
        <Box sx={{ width: "100%", maxWidth: 520 }}>{children}</Box>
      </Box>
    </ThemeProvider>
  );
}

function Header({ title, subtitle }) {
  return (
    <Stack alignItems="center" spacing={1.5} sx={{ mb: { xs: 3, sm: 4 }, textAlign: "center" }}>
      <MatchQueensLogo size={30} />
      <Typography
        component="h1"
        variant="h4"
        sx={{ fontSize: { xs: "1.6rem", sm: "1.95rem" }, color: "#9f1239", fontWeight: 800 }}
      >
        {title}
      </Typography>
      {subtitle && (
        <Typography sx={{ color: MUTED, fontSize: { xs: "0.95rem", sm: "1rem" }, maxWidth: 380 }}>
          {subtitle}
        </Typography>
      )}
    </Stack>
  );
}

function FeedbackCard({ children }) {
  return (
    <Card
      sx={{
        borderRadius: "22px",
        border: "1px solid rgba(225,29,106,0.16)",
        boxShadow: "0 20px 50px rgba(159,18,57,0.10)",
        backgroundColor: "#fff",
        p: { xs: 2.5, sm: 3.5 },
      }}
    >
      {children}
    </Card>
  );
}

// A simple centred outcome panel (success / already done / not a participant / …).
function OutcomePanel({ title, body, primaryLabel, onPrimary, secondaryLabel, onSecondary }) {
  return (
    <FeedbackCard>
      <Stack spacing={2} alignItems="center" sx={{ textAlign: "center" }} aria-live="polite">
        <Box
          sx={{
            width: 54,
            height: 54,
            borderRadius: "16px",
            display: "grid",
            placeItems: "center",
            color: PINK,
            backgroundColor: "rgba(225,29,106,0.10)",
          }}
        >
          <FavoriteRoundedIcon />
        </Box>
        <Typography sx={{ fontWeight: 800, color: INK, fontSize: "1.15rem" }}>{title}</Typography>
        {body && (
          <Typography sx={{ color: MUTED, lineHeight: 1.7 }}>{body}</Typography>
        )}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ pt: 1, width: "100%" }} justifyContent="center">
          {secondaryLabel && (
            <Button variant="outlined" onClick={onSecondary} sx={{ fontWeight: 700 }}>
              {secondaryLabel}
            </Button>
          )}
          <Button variant="contained" onClick={onPrimary} sx={{ fontWeight: 700 }}>
            {primaryLabel}
          </Button>
        </Stack>
      </Stack>
    </FeedbackCard>
  );
}

export default function MeetingFeedbackPage() {
  const { t, lang } = useLanguage();
  const c = t.app.feedback;
  const navigate = useNavigate();
  const { meetingId } = useParams();
  const { id: actingUserId } = useCurrentUser();

  // "loading" | "error" | "forbidden" | "notfound" | "notended" | "form" | "done" | "already"
  const [phase, setPhase] = useState("loading");
  const [ctx, setCtx] = useState(null);
  const [step, setStep] = useState(STEP.ASK);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // form fields
  const [reason, setReason] = useState("");
  const [explanation, setExplanation] = useState("");
  const [rating, setRating] = useState(0);
  const [wasHelpful, setWasHelpful] = useState("");
  const [wouldContinue, setWouldContinue] = useState("");
  const [comment, setComment] = useState("");

  const goPersonalArea = () => navigate(ROUTES.APP_PERSONAL_AREA);

  const load = useCallback(async () => {
    if (!actingUserId) {
      setPhase("error");
      return;
    }
    setPhase("loading");
    try {
      const data = await fetchMeetingFeedback(meetingId, actingUserId);
      setCtx(data);
      if (data.alreadySubmitted) setPhase("already");
      else if (!data.meetingEnded) setPhase("notended");
      else setPhase("form");
    } catch (err) {
      if (err.status === 403) setPhase("forbidden");
      else if (err.status === 404) setPhase("notfound");
      else setPhase("error");
    }
  }, [meetingId, actingUserId]);

  useEffect(() => {
    load();
  }, [load]);

  const meetingWhen = useMemo(() => {
    if (!ctx || !ctx.meeting) return "";
    try {
      return formatDateTimeLabel(ctx.meeting.scheduledStart, lang);
    } catch {
      return "";
    }
  }, [ctx, lang]);

  const doSubmit = async (answers) => {
    if (submitting) return;
    setSubmitting(true);
    setFormError("");
    try {
      await submitMeetingFeedback(meetingId, actingUserId, answers);
      setPhase("done");
    } catch (err) {
      if (err.status === 409) {
        // Already submitted elsewhere, or the meeting state changed under us —
        // reconcile with the server rather than pretend success.
        if (/already/i.test(err.message)) setPhase("already");
        else {
          setFormError(c.conflictError);
          load();
        }
      } else if (err.status === 403) {
        setPhase("forbidden");
      } else if (err.status === 400) {
        setFormError(err.message || c.submitError);
      } else {
        setFormError(c.submitError);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const submitNo = () => {
    if (!reason) {
      setFormError(c.no.errorReasonRequired);
      return;
    }
    if (reason === "OTHER" && !explanation.trim()) {
      setFormError(c.no.errorOtherRequired);
      return;
    }
    doSubmit({
      occurred: false,
      notOccurredReason: reason,
      notOccurredExplanation: explanation.trim() || undefined,
    });
  };

  const submitYes = () => {
    if (!rating) {
      setFormError(c.yes.ratingRequired);
      return;
    }
    if (!wasHelpful) {
      setFormError(c.yes.helpfulRequired);
      return;
    }
    doSubmit({
      occurred: true,
      rating,
      wasHelpful,
      wouldContinueMentoring:
        ctx.role === "MENTEE" && wouldContinue ? wouldContinue : undefined,
      comment: comment.trim() || undefined,
    });
  };

  // ---- render ------------------------------------------------------------
  if (phase === "loading") {
    return (
      <FocusShell>
        <Header title={c.pageTitle} subtitle={c.pageSubtitle} />
        <FeedbackCard>
          <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="center" sx={{ py: 2 }}>
            <CircularProgress size={20} />
            <Typography sx={{ color: MUTED }} aria-live="polite">
              {c.loading}
            </Typography>
          </Stack>
        </FeedbackCard>
      </FocusShell>
    );
  }

  if (phase === "error") {
    return (
      <FocusShell>
        <Header title={c.pageTitle} />
        <OutcomePanel
          title={c.loadError.title}
          body={c.loadError.body}
          primaryLabel={c.loadError.retry}
          onPrimary={load}
          secondaryLabel={c.loadError.cta}
          onSecondary={goPersonalArea}
        />
      </FocusShell>
    );
  }

  if (phase === "forbidden") {
    return (
      <FocusShell>
        <Header title={c.pageTitle} />
        <OutcomePanel
          title={c.forbidden.title}
          body={c.forbidden.body}
          primaryLabel={c.forbidden.cta}
          onPrimary={goPersonalArea}
        />
      </FocusShell>
    );
  }

  if (phase === "notfound") {
    return (
      <FocusShell>
        <Header title={c.pageTitle} />
        <OutcomePanel
          title={c.notFound.title}
          body={c.notFound.body}
          primaryLabel={c.notFound.cta}
          onPrimary={goPersonalArea}
        />
      </FocusShell>
    );
  }

  if (phase === "notended") {
    return (
      <FocusShell>
        <Header title={c.pageTitle} subtitle={c.pageSubtitle} />
        <OutcomePanel
          title={c.notEnded.title}
          body={meetingWhen ? `${c.notEnded.body} (${meetingWhen})` : c.notEnded.body}
          primaryLabel={c.notEnded.cta}
          onPrimary={goPersonalArea}
        />
      </FocusShell>
    );
  }

  if (phase === "already") {
    return (
      <FocusShell>
        <Header title={c.pageTitle} />
        <OutcomePanel
          title={c.already.title}
          body={c.already.body}
          primaryLabel={c.already.cta}
          onPrimary={goPersonalArea}
        />
      </FocusShell>
    );
  }

  if (phase === "done") {
    return (
      <FocusShell>
        <Header title={c.pageTitle} />
        <OutcomePanel
          title={c.success.title}
          body={c.success.body}
          primaryLabel={c.success.cta}
          onPrimary={goPersonalArea}
        />
      </FocusShell>
    );
  }

  // phase === "form"
  return (
    <FocusShell>
      <Header title={c.pageTitle} subtitle={c.pageSubtitle} />
      <FeedbackCard>
        {meetingWhen && (
          <Typography sx={{ mb: 2, fontSize: "0.85rem", color: MUTED, textAlign: "center" }}>
            {c.meetingWhenLabel}: {meetingWhen}
          </Typography>
        )}

        {step === STEP.ASK && (
          <Stack spacing={2}>
            <Typography component="h2" sx={{ fontWeight: 800, color: INK, fontSize: "1.05rem", textAlign: "center" }}>
              {c.ask.question}
            </Typography>
            <Button
              size="large"
              variant="contained"
              onClick={() => {
                setFormError("");
                setStep(STEP.YES);
              }}
              sx={{ py: 1.4, fontWeight: 800, fontSize: "1rem" }}
            >
              {c.ask.yes}
            </Button>
            <Button
              size="large"
              variant="outlined"
              onClick={() => {
                setFormError("");
                setStep(STEP.NO);
              }}
              sx={{ py: 1.4, fontWeight: 800, fontSize: "1rem" }}
            >
              {c.ask.no}
            </Button>
          </Stack>
        )}

        {step === STEP.NO && (
          <Stack spacing={2.5} component="form" noValidate onSubmit={(e) => { e.preventDefault(); submitNo(); }}>
            <FormControl component="fieldset" disabled={submitting}>
              <FormLabel
                component="legend"
                sx={{ fontWeight: 800, color: INK, "&.Mui-focused": { color: INK }, mb: 0.5 }}
              >
                {c.no.question}
              </FormLabel>
              <RadioGroup value={reason} onChange={(e) => { setReason(e.target.value); setFormError(""); }}>
                {(ctx.reasons || []).map((key) => (
                  <FormControlLabel
                    key={key}
                    value={key}
                    control={<Radio />}
                    label={<Typography sx={{ color: INK }}>{c.no.reasons[key] || key}</Typography>}
                    sx={{ py: 0.4, mx: 0 }}
                  />
                ))}
              </RadioGroup>
            </FormControl>

            {reason === "OTHER" && (
              <TextField
                label={c.no.otherLabel}
                placeholder={c.no.otherPlaceholder}
                value={explanation}
                onChange={(e) => { setExplanation(e.target.value); setFormError(""); }}
                disabled={submitting}
                required
                multiline
                minRows={2}
                inputProps={{ maxLength: 1000 }}
              />
            )}
            {reason && reason !== "OTHER" && (
              <TextField
                label={c.no.explanationLabel}
                placeholder={c.no.explanationPlaceholder}
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                disabled={submitting}
                multiline
                minRows={2}
                inputProps={{ maxLength: 1000 }}
              />
            )}

            {formError && <Alert severity="error">{formError}</Alert>}

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} justifyContent="space-between">
              <Button
                type="button"
                variant="text"
                onClick={() => { setStep(STEP.ASK); setFormError(""); }}
                disabled={submitting}
                sx={{ fontWeight: 700 }}
              >
                {c.back}
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={submitting}
                startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : null}
                sx={{ fontWeight: 800 }}
              >
                {submitting ? c.submitting : c.no.submit}
              </Button>
            </Stack>
          </Stack>
        )}

        {step === STEP.YES && (
          <Stack spacing={2.75} component="form" noValidate onSubmit={(e) => { e.preventDefault(); submitYes(); }}>
            <FormControl component="fieldset" disabled={submitting}>
              <FormLabel
                component="legend"
                sx={{ fontWeight: 800, color: INK, "&.Mui-focused": { color: INK }, mb: 0.75 }}
              >
                {c.yes.ratingQuestion}
              </FormLabel>
              <Rating
                name="meeting-rating"
                value={rating}
                onChange={(_e, v) => { setRating(v || 0); setFormError(""); }}
                disabled={submitting}
                size="large"
                icon={<StarRoundedIcon fontSize="inherit" />}
                emptyIcon={<StarBorderRoundedIcon fontSize="inherit" />}
                getLabelText={(v) => `${v} / 5`}
                sx={{ color: PINK, fontSize: "2.4rem" }}
              />
            </FormControl>

            <FormControl component="fieldset" disabled={submitting}>
              <FormLabel
                component="legend"
                sx={{ fontWeight: 800, color: INK, "&.Mui-focused": { color: INK }, mb: 0.5 }}
              >
                {c.yes.helpfulQuestion}
              </FormLabel>
              <RadioGroup
                value={wasHelpful}
                onChange={(e) => { setWasHelpful(e.target.value); setFormError(""); }}
              >
                {["YES", "SOMEWHAT", "NO"].map((key) => (
                  <FormControlLabel
                    key={key}
                    value={key}
                    control={<Radio />}
                    label={<Typography sx={{ color: INK }}>{c.yes.helpful[key]}</Typography>}
                    sx={{ py: 0.3, mx: 0 }}
                  />
                ))}
              </RadioGroup>
            </FormControl>

            {ctx.role === "MENTEE" && (
              <FormControl component="fieldset" disabled={submitting}>
                <FormLabel
                  component="legend"
                  sx={{ fontWeight: 800, color: INK, "&.Mui-focused": { color: INK }, mb: 0.5 }}
                >
                  {c.yes.continueQuestion}
                </FormLabel>
                <RadioGroup
                  value={wouldContinue}
                  onChange={(e) => setWouldContinue(e.target.value)}
                >
                  {["YES", "NO", "NOT_SURE_YET"].map((key) => (
                    <FormControlLabel
                      key={key}
                      value={key}
                      control={<Radio />}
                      label={<Typography sx={{ color: INK }}>{c.yes.continue[key]}</Typography>}
                      sx={{ py: 0.3, mx: 0 }}
                    />
                  ))}
                </RadioGroup>
              </FormControl>
            )}

            <TextField
              label={c.yes.commentLabel}
              placeholder={c.yes.commentPlaceholder}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={submitting}
              multiline
              minRows={3}
              inputProps={{ maxLength: 1000 }}
            />

            {formError && <Alert severity="error">{formError}</Alert>}

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} justifyContent="space-between">
              <Button
                type="button"
                variant="text"
                onClick={() => { setStep(STEP.ASK); setFormError(""); }}
                disabled={submitting}
                sx={{ fontWeight: 700 }}
              >
                {c.back}
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={submitting}
                startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : null}
                sx={{ fontWeight: 800 }}
              >
                {submitting ? c.submitting : c.yes.submit}
              </Button>
            </Stack>
          </Stack>
        )}
      </FeedbackCard>
    </FocusShell>
  );
}
