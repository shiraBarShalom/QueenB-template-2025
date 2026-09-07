import React, { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Snackbar, Stack, Typography } from "@mui/material";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import EventNoteRoundedIcon from "@mui/icons-material/EventNoteRounded";

import { useLanguage } from "../../../i18n/LanguageProvider";
import { useCurrentUser } from "../../../auth/useCurrentUser";
import fillTemplate from "../../../utils/fillTemplate";
import { formatDayLabel, formatTimeRange } from "../../../utils/slotTime";
import {
  fetchMenteeScheduling,
  selectSlot,
  cannotAttend,
  withdrawRequest,
  rescheduleRequest,
  cannotAttendMeeting,
} from "../../../api/menteeScheduling";
import ContentCard from "../ContentCard";
import ListContainer from "../ListContainer";
import EmptyState from "../EmptyState";
import CannotAttendMeetingDialog from "../CannotAttendMeetingDialog";
import ProposedSlotsCard from "./ProposedSlotsCard";
import MenteeMeetingCard from "./MenteeMeetingCard";
import MenteeRequestStatusCard from "./MenteeRequestStatusCard";
import ConfirmDialog from "./ConfirmDialog";

/**
 * Self-contained scheduling block for the mentee's Personal Area (Part 4+).
 *
 * PersonalAreaPage mounts this as the scheduling ContentCard. It reads
 * GET /api/mentees/:userId/scheduling and groups rows into pending / scheduled /
 * past. Mutations go through existing POST routes; the frontend never computes
 * status. After every action it re-reads the projection; 409/404/403 never fake
 * success.
 *
 * MATCHED meetings offer two independent actions:
 *   RESCHEDULE (once) and CANNOT_ATTEND_MEETING (cancel with reason, anytime).
 */
const FINAL_RETRY = 2;

export default function MenteeSchedulingSection() {
  const { t, lang } = useLanguage();
  const c = t.app.personalArea.scheduling;
  const { id: actingUserId } = useCurrentUser();

  const [phase, setPhase] = useState("loading"); // "loading" | "ready" | "error"
  const [items, setItems] = useState([]);
  const [dialog, setDialog] = useState(null); // { kind, request, offeredSlotId? }
  const [cannotAttendTarget, setCannotAttendTarget] = useState(null); // request
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!actingUserId) {
        setPhase("error");
        return;
      }
      if (!silent) setPhase("loading");
      try {
        const data = await fetchMenteeScheduling(actingUserId);
        setItems(Array.isArray(data) ? data : []);
        setPhase("ready");
      } catch (err) {
        if (silent) setToast({ severity: "error", message: c.toast.error });
        else setPhase("error");
      }
    },
    [actingUserId, c.toast.error]
  );

  useEffect(() => {
    load();
  }, [load]);

  const closeDialog = () => {
    if (!submitting) setDialog(null);
  };

  const askSelect = (request, offeredSlotId) =>
    setDialog({ kind: "select", request, offeredSlotId });
  const askCannotAttend = (request) =>
    setDialog({
      kind: request.retryCount >= FINAL_RETRY ? "cannotAttendFinal" : "cannotAttendRetry",
      request,
    });
  const askWithdraw = (request) => setDialog({ kind: "withdraw", request });
  const askReschedule = (request) => setDialog({ kind: "reschedule", request });
  const askCannotAttendMeeting = (request) => setCannotAttendTarget(request);
  const closeCannotAttendMeeting = () => {
    if (!submitting) setCannotAttendTarget(null);
  };

  // Part 15: the reschedule is spent — end the request and message the mentor.
  // Not a reschedule; a distinct terminal action.
  const runCannotAttendMeeting = async (reason) => {
    if (submitting || !cannotAttendTarget) return;
    setSubmitting(true);
    try {
      await cannotAttendMeeting(cannotAttendTarget.id, actingUserId, reason);
      setCannotAttendTarget(null);
      setToast({ severity: "success", message: c.confirmCannotAttendMeeting.success });
      load({ silent: true });
    } catch (err) {
      if (err.status === 409) {
        setCannotAttendTarget(null);
        setToast({ severity: "warning", message: c.toast.conflict });
        load({ silent: true });
      } else if (err.status === 404) {
        setCannotAttendTarget(null);
        setToast({ severity: "warning", message: c.toast.notFound });
        load({ silent: true });
      } else if (err.status === 403) {
        setCannotAttendTarget(null);
        setToast({ severity: "error", message: c.toast.forbidden });
        load({ silent: true });
      } else {
        // 400 / network — keep the dialog open so she can fix the note or cancel.
        setToast({ severity: "error", message: c.toast.error });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const runAction = async () => {
    if (submitting || !dialog) return; // guard against a double submit
    const { kind, request, offeredSlotId } = dialog;
    setSubmitting(true);
    try {
      if (kind === "select") {
        await selectSlot(request.id, actingUserId, offeredSlotId);
        setToast({ severity: "success", message: c.toast.selectSuccess });
      } else if (kind === "withdraw") {
        await withdrawRequest(request.id, actingUserId);
        setToast({ severity: "success", message: c.toast.withdrawSuccess });
      } else if (kind === "reschedule") {
        await rescheduleRequest(request.id, actingUserId);
        setToast({ severity: "success", message: c.confirmReschedule.success });
      } else {
        // cannotAttendRetry | cannotAttendFinal — the server decides which
        // outcome from retryCount; read it back to pick the right message.
        const updated = await cannotAttend(request.id, actingUserId);
        const closed = updated && updated.status === "CANCELLED";
        setToast({
          severity: closed ? "info" : "success",
          message: closed ? c.toast.closedSuccess : c.toast.retrySuccess,
        });
      }
      setDialog(null);
      load({ silent: true });
    } catch (err) {
      if (err.status === 409) {
        setToast({ severity: "warning", message: c.toast.conflict });
        setDialog(null);
        load({ silent: true });
      } else if (err.status === 404) {
        setToast({ severity: "warning", message: c.toast.notFound });
        setDialog(null);
        load({ silent: true });
      } else if (err.status === 403) {
        setToast({ severity: "error", message: c.toast.forbidden });
        setDialog(null);
        load({ silent: true });
      } else {
        // 400 / network — keep the dialog open so she can retry or cancel.
        setToast({ severity: "error", message: c.toast.error });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const dialogProps = () => {
    if (!dialog) return { open: false };
    const { kind, request, offeredSlotId } = dialog;
    if (kind === "select") {
      const slot = ((request.proposal && request.proposal.slots) || []).find(
        (s) => s.id === offeredSlotId
      );
      const label = slot
        ? `${formatDayLabel(slot.startTime, lang)} · ${formatTimeRange(
            slot.startTime,
            slot.endTime,
            lang
          )}`
        : "";
      return {
        open: true,
        title: c.confirmSelect.title,
        body: fillTemplate(c.confirmSelect.body, { slot: label }),
        confirmLabel: c.confirmSelect.confirm,
        cancelLabel: c.confirmSelect.cancel,
        confirmColor: "primary",
      };
    }
    if (kind === "cannotAttendRetry") {
      return {
        open: true,
        title: c.confirmCannotAttendRetry.title,
        body: fillTemplate(c.confirmCannotAttendRetry.body, {
          mentor: request.mentor.fullName,
        }),
        confirmLabel: c.confirmCannotAttendRetry.confirm,
        cancelLabel: c.confirmCannotAttendRetry.cancel,
        confirmColor: "primary",
      };
    }
    if (kind === "cannotAttendFinal") {
      return {
        open: true,
        title: c.confirmCannotAttendFinal.title,
        body: c.confirmCannotAttendFinal.body,
        confirmLabel: c.confirmCannotAttendFinal.confirm,
        cancelLabel: c.confirmCannotAttendFinal.cancel,
        confirmColor: "error",
      };
    }
    if (kind === "reschedule") {
      return {
        open: true,
        title: c.confirmReschedule.title,
        body: fillTemplate(c.confirmReschedule.body, {
          mentor: request.mentor.fullName,
        }),
        confirmLabel: c.confirmReschedule.confirm,
        cancelLabel: c.confirmReschedule.cancel,
        confirmColor: "error",
      };
    }
    return {
      open: true,
      title: c.confirmWithdraw.title,
      body: c.confirmWithdraw.body,
      confirmLabel: c.confirmWithdraw.confirm,
      cancelLabel: c.confirmWithdraw.cancel,
      confirmColor: "error",
    };
  };

  const loading = phase === "loading";
  // Pending (needs action or waiting on mentor), scheduled, then past/cancelled.
  const proposals = items.filter((i) => i.status === "WAITING_FOR_MENTEE_SELECTION");
  const waiting = items.filter((i) => i.status === "WAITING_FOR_MENTOR_SLOTS");
  const matched = items.filter((i) => i.status === "MATCHED");
  const closed = items.filter(
    (i) => i.status === "REJECTED" || i.status === "CANCELLED"
  );
  const pending = [...proposals, ...waiting];
  const sections = c.sections || {};

  const sectionHeadingSx = {
    fontSize: "0.8rem",
    fontWeight: 800,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "#b05a75",
    mb: 1,
  };

  return (
    <ContentCard title={c.title}>
      <Typography sx={{ mt: -1, mb: 2, fontSize: "0.9rem", color: "#6d3049" }}>
        {c.subtitle}
      </Typography>

      {phase === "error" ? (
        <EmptyState
          icon={ErrorOutlineRoundedIcon}
          title={c.loadError}
          action={
            <Button variant="outlined" onClick={() => load()}>
              {c.retry}
            </Button>
          }
        />
      ) : (
        <ListContainer
          loading={loading}
          skeletonCount={2}
          isEmpty={phase === "ready" && items.length === 0}
          empty={{
            icon: EventNoteRoundedIcon,
            title: c.emptyTitle,
            hint: c.emptyHint,
          }}
        >
          {pending.length > 0 && (
            <Box>
              <Typography sx={sectionHeadingSx}>
                {sections.pending || "Pending"}
              </Typography>
              <Stack spacing={1.5}>
                {proposals.map((r) => (
                  <ProposedSlotsCard
                    key={r.id}
                    request={r}
                    disabled={submitting}
                    onSelectSlot={(slotId) => askSelect(r, slotId)}
                    onCannotAttend={() => askCannotAttend(r)}
                    onWithdraw={() => askWithdraw(r)}
                  />
                ))}
                {waiting.map((r) => (
                  <MenteeRequestStatusCard key={r.id} request={r} />
                ))}
              </Stack>
            </Box>
          )}

          {matched.length > 0 && (
            <Box>
              <Typography sx={sectionHeadingSx}>
                {sections.scheduled || "Scheduled"}
              </Typography>
              <Stack spacing={1.5}>
                {matched.map((r) => (
                  <MenteeMeetingCard
                    key={r.id}
                    request={r}
                    disabled={submitting}
                    onReschedule={() => askReschedule(r)}
                    onCannotAttend={() => askCannotAttendMeeting(r)}
                  />
                ))}
              </Stack>
            </Box>
          )}

          {closed.length > 0 && (
            <Box>
              <Typography sx={sectionHeadingSx}>
                {sections.past || "Past"}
              </Typography>
              <Stack spacing={1.5}>
                {closed.map((r) => (
                  <MenteeRequestStatusCard key={r.id} request={r} />
                ))}
              </Stack>
            </Box>
          )}
        </ListContainer>
      )}

      <ConfirmDialog
        {...dialogProps()}
        pending={submitting}
        onCancel={closeDialog}
        onConfirm={runAction}
      />

      <CannotAttendMeetingDialog
        open={Boolean(cannotAttendTarget)}
        copy={c.confirmCannotAttendMeeting}
        pending={submitting}
        onCancel={closeCannotAttendMeeting}
        onConfirm={runCannotAttendMeeting}
      />

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={5000}
        onClose={(_e, reason) => {
          if (reason !== "clickaway") setToast(null);
        }}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {toast ? (
          <Alert
            severity={toast.severity}
            variant="filled"
            onClose={() => setToast(null)}
            sx={{ fontWeight: 600 }}
          >
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </ContentCard>
  );
}
