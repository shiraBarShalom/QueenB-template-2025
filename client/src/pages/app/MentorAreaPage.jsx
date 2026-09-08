import React, { useCallback, useEffect, useState } from "react";
import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";
import { Alert, Box, Button, Snackbar, Stack, Typography } from "@mui/material";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";

import { ROUTES } from "../../constants/routes";
import MarkEmailReadRoundedIcon from "@mui/icons-material/MarkEmailReadRounded";
import HourglassEmptyRoundedIcon from "@mui/icons-material/HourglassEmptyRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";

import { useLanguage } from "../../i18n/LanguageProvider";
import { useCurrentUser } from "../../auth/useCurrentUser";
import fillTemplate from "../../utils/fillTemplate";
import {
  fetchMentorDashboard,
  rejectMentoringRequest,
  approveSuggestedSlot,
  rescheduleMentoringRequest,
  cannotAttendMeetingRequest,
} from "../../api/mentorScheduling";
import { formatDateTimeLabel } from "../../utils/slotTime";
import PageHeader from "../../components/app/PageHeader";
import ContentCard from "../../components/app/ContentCard";
import ListContainer from "../../components/app/ListContainer";
import EmptyState from "../../components/app/EmptyState";
import DashboardSummary from "../../components/app/mentor/DashboardSummary";
import IncomingRequestCard from "../../components/app/mentor/IncomingRequestCard";
import AwaitingSelectionCard from "../../components/app/mentor/AwaitingSelectionCard";
import ScheduledMeetingCard from "../../components/app/mentor/ScheduledMeetingCard";
import ConfirmRejectDialog from "../../components/app/mentor/ConfirmRejectDialog";
import ConfirmDialog from "../../components/app/mentee/ConfirmDialog";
import CannotAttendMeetingDialog from "../../components/app/CannotAttendMeetingDialog";

/**
 * `/app/mentor-area` — the logged-in mentor's personal scheduling dashboard.
 *
 * The three summary tiles are FILTERS: clicking one switches the section below.
 *   waitingForResponse      -> WAITING_FOR_MENTOR_SLOTS   (actionable: propose / reject)
 *   awaitingMenteeSelection -> WAITING_FOR_MENTEE_SELECTION (slots already proposed)
 *   scheduledMeetings       -> MATCHED                    (a Meeting exists)
 *
 * All three lists come from one read-only endpoint
 * (GET /api/mentors/:id/dashboard -> requestService.getMentorDashboard); the
 * counts and the rows are the same query, so a non-zero count always has rows
 * behind it. The scheduling state machine stays entirely on the server — this
 * page only calls REJECT and then re-reads to reconcile.
 *
 * Identity comes from useCurrentUser() (the auth seam), never from the UI:
 * `mentorProfileId` reads the dashboard; `id` is the `actingUserId` the server
 * validates against the request's assigned mentor.
 */
const PANEL_ID = "mentor-section-panel";
const DEFAULT_TAB = "waitingForResponse";

export default function MentorAreaPage() {
  const { t, lang } = useLanguage();
  const c = t.app.mentorArea;
  const { id: actingUserId, mentorProfileId } = useCurrentUser();
  const location = useLocation();
  const navigate = useNavigate();

  const [phase, setPhase] = useState("loading"); // "loading" | "ready" | "error"
  const [errorKind, setErrorKind] = useState(null); // "noProfile" | "load"
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState(DEFAULT_TAB);

  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejecting, setRejecting] = useState(false);
  const [approveTarget, setApproveTarget] = useState(null); // { request, slot }
  const [approving, setApproving] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [cannotAttendTarget, setCannotAttendTarget] = useState(null);
  const [cannotAttending, setCannotAttending] = useState(false);
  const [toast, setToast] = useState(null); // { severity, message }

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!mentorProfileId) {
        setPhase("error");
        setErrorKind("noProfile");
        return;
      }
      if (!silent) setPhase("loading");
      try {
        const dashboard = await fetchMentorDashboard(mentorProfileId);
        setData(dashboard);
        setPhase("ready");
        setErrorKind(null);
      } catch (err) {
        if (silent) {
          setToast({ severity: "error", message: c.incoming.loadError });
        } else {
          setPhase("error");
          setErrorKind("load");
        }
      }
    },
    [mentorProfileId, c.incoming.loadError]
  );

  useEffect(() => {
    load();
  }, [load]);

  // One-shot success feedback after ProposeSlotsPage navigates back here, then
  // jump to the section where the request now lives so the mentor sees it move.
  useEffect(() => {
    if (location.state && location.state.flash === "slotsProposed") {
      setToast({ severity: "success", message: c.proposeSlots.successFlash });
      setActiveTab("awaitingMenteeSelection");
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate, c.proposeSlots.successFlash]);

  const openReject = (request) => setRejectTarget(request);
  const closeReject = () => {
    if (!rejecting) setRejectTarget(null);
  };

  const confirmReject = async () => {
    if (rejecting || !rejectTarget) return; // guard against a double submit
    const targetId = rejectTarget.id;
    setRejecting(true);
    try {
      await rejectMentoringRequest(targetId, actingUserId);
      // Optimistic reconcile, then a silent refetch to confirm against the DB.
      setData((prev) =>
        prev
          ? {
              ...prev,
              counts: {
                ...prev.counts,
                waitingForResponse: Math.max(0, prev.counts.waitingForResponse - 1),
              },
              incomingRequests: prev.incomingRequests.filter((r) => r.id !== targetId),
            }
          : prev
      );
      setRejectTarget(null);
      setToast({ severity: "success", message: c.reject.success });
      load({ silent: true });
    } catch (err) {
      if (err.status === 409) {
        // The request moved on. Do not fake success — reconcile from the server.
        setRejectTarget(null);
        setToast({ severity: "warning", message: c.reject.conflict });
        load({ silent: true });
      } else {
        setToast({ severity: "error", message: c.reject.error });
      }
    } finally {
      setRejecting(false);
    }
  };

  const openApprove = (request, slot) => setApproveTarget({ request, slot });
  const closeApprove = () => {
    if (!approving) setApproveTarget(null);
  };

  // Mentor approves one of the mentee's suggested times → same completion as the
  // mentee's select-slot: one Meeting, request MATCHED. The backend is
  // authoritative; a 409 means another tab / the mentee moved it on first.
  const confirmApprove = async () => {
    if (approving || !approveTarget) return; // guard against a double submit
    const { request: targetRequest, slot } = approveTarget;
    setApproving(true);
    try {
      await approveSuggestedSlot(targetRequest.id, actingUserId, slot.id);
      setData((prev) =>
        prev
          ? {
              ...prev,
              counts: {
                ...prev.counts,
                waitingForResponse: Math.max(0, prev.counts.waitingForResponse - 1),
                scheduledMeetings: prev.counts.scheduledMeetings + 1,
              },
              incomingRequests: prev.incomingRequests.filter(
                (r) => r.id !== targetRequest.id
              ),
            }
          : prev
      );
      setApproveTarget(null);
      setToast({ severity: "success", message: c.approveSuggested.success });
      setActiveTab("scheduledMeetings");
      load({ silent: true });
    } catch (err) {
      if (err.status === 409) {
        setApproveTarget(null);
        setToast({ severity: "warning", message: c.approveSuggested.conflict });
        load({ silent: true });
      } else {
        setToast({ severity: "error", message: c.approveSuggested.error });
      }
    } finally {
      setApproving(false);
    }
  };

  const openReschedule = (request) => setRescheduleTarget(request);
  const closeReschedule = () => {
    if (!rescheduling) setRescheduleTarget(null);
  };

  const confirmReschedule = async () => {
    if (rescheduling || !rescheduleTarget) return; // guard against a double submit
    const targetId = rescheduleTarget.id;
    setRescheduling(true);
    try {
      await rescheduleMentoringRequest(targetId, actingUserId);
      setData((prev) =>
        prev
          ? {
              ...prev,
              counts: {
                ...prev.counts,
                scheduledMeetings: Math.max(0, prev.counts.scheduledMeetings - 1),
                waitingForResponse: prev.counts.waitingForResponse + 1,
              },
              scheduledRequests: (prev.scheduledRequests || []).filter(
                (r) => r.id !== targetId
              ),
            }
          : prev
      );
      setRescheduleTarget(null);
      setToast({ severity: "success", message: c.reschedule.success });
      setActiveTab("waitingForResponse");
      load({ silent: true });
    } catch (err) {
      if (err.status === 409) {
        setRescheduleTarget(null);
        setToast({ severity: "warning", message: c.reschedule.conflict });
        load({ silent: true });
      } else {
        setToast({ severity: "error", message: c.reschedule.error });
      }
    } finally {
      setRescheduling(false);
    }
  };

  const openCannotAttend = (request) => setCannotAttendTarget(request);
  const closeCannotAttend = () => {
    if (!cannotAttending) setCannotAttendTarget(null);
  };

  // Part 15: the reschedule is spent — the mentor cannot attend, so end the
  // request and message the mentee. Distinct terminal action, NOT a reschedule.
  const confirmCannotAttend = async (reason) => {
    if (cannotAttending || !cannotAttendTarget) return; // guard against a double submit
    const targetId = cannotAttendTarget.id;
    setCannotAttending(true);
    try {
      await cannotAttendMeetingRequest(targetId, actingUserId, reason);
      setData((prev) =>
        prev
          ? {
              ...prev,
              counts: {
                ...prev.counts,
                scheduledMeetings: Math.max(0, prev.counts.scheduledMeetings - 1),
              },
              scheduledRequests: (prev.scheduledRequests || []).filter(
                (r) => r.id !== targetId
              ),
            }
          : prev
      );
      setCannotAttendTarget(null);
      setToast({ severity: "success", message: c.cannotAttendMeeting.success });
      load({ silent: true });
    } catch (err) {
      if (err.status === 409) {
        setCannotAttendTarget(null);
        setToast({ severity: "warning", message: c.cannotAttendMeeting.conflict });
        load({ silent: true });
      } else {
        // 400 / 403 / network — keep the dialog open so she can fix or cancel.
        setToast({ severity: "error", message: c.cannotAttendMeeting.error });
      }
    } finally {
      setCannotAttending(false);
    }
  };

  const loading = phase === "loading";

  const sections = {
    waitingForResponse: {
      title: c.incoming.title,
      subtitle: c.incoming.subtitle,
      items: data ? data.incomingRequests : [],
      empty: {
        icon: MarkEmailReadRoundedIcon,
        title: c.incoming.emptyTitle,
        hint: c.incoming.emptyHint,
      },
      render: (r) => (
        <IncomingRequestCard
          key={r.id}
          request={r}
          busy={
            (rejecting && rejectTarget?.id === r.id) ||
            (approving && approveTarget?.request?.id === r.id)
          }
          onReject={openReject}
          onApprove={openApprove}
        />
      ),
    },
    awaitingMenteeSelection: {
      title: c.sections.awaitingSelection.title,
      subtitle: c.sections.awaitingSelection.subtitle,
      items: data ? data.awaitingSelectionRequests || [] : [],
      empty: {
        icon: HourglassEmptyRoundedIcon,
        title: c.sections.awaitingSelection.emptyTitle,
        hint: c.sections.awaitingSelection.emptyHint,
      },
      render: (r) => <AwaitingSelectionCard key={r.id} request={r} />,
    },
    scheduledMeetings: {
      title: c.sections.scheduled.title,
      subtitle: c.sections.scheduled.subtitle,
      items: data ? data.scheduledRequests || [] : [],
      empty: {
        icon: EventAvailableRoundedIcon,
        title: c.sections.scheduled.emptyTitle,
        hint: c.sections.scheduled.emptyHint,
      },
      render: (r) => (
        <ScheduledMeetingCard
          key={r.id}
          request={r}
          busy={
            (rescheduling && rescheduleTarget?.id === r.id) ||
            (cannotAttending && cannotAttendTarget?.id === r.id)
          }
          onReschedule={openReschedule}
          onCannotAttend={openCannotAttend}
        />
      ),
    },
  };
  const section = sections[activeTab] || sections[DEFAULT_TAB];

  return (
    <Box>
      <PageHeader
        title={c.title}
        description={c.description}
        action={
          <Button
            component={RouterLink}
            to={ROUTES.APP_MENTOR_PROFILE_EDIT}
            variant="outlined"
            size="small"
            startIcon={<EditRoundedIcon fontSize="small" />}
            sx={{ fontWeight: 700, whiteSpace: "nowrap" }}
          >
            {t.app.nav.editMentorProfile}
          </Button>
        }
      />

      <Stack spacing={{ xs: 2.5, md: 3 }}>
        <DashboardSummary
          counts={data ? data.counts : null}
          loading={loading}
          activeKey={activeTab}
          onSelect={setActiveTab}
          panelId={PANEL_ID}
        />

        <Box id={PANEL_ID} role="region" aria-label={section.title} aria-live="polite">
          <ContentCard title={section.title}>
            <Typography sx={{ mt: -1, mb: 2, fontSize: "0.9rem", color: "#6d3049" }}>
              {section.subtitle}
            </Typography>

            {phase === "error" ? (
              <EmptyState
                icon={ErrorOutlineRoundedIcon}
                title={
                  errorKind === "noProfile"
                    ? c.incoming.noProfile
                    : c.incoming.loadError
                }
                action={
                  errorKind === "load" ? (
                    <Button variant="outlined" onClick={() => load()}>
                      {c.incoming.retry}
                    </Button>
                  ) : null
                }
              />
            ) : (
              <ListContainer
                loading={loading}
                skeletonCount={2}
                isEmpty={phase === "ready" && section.items.length === 0}
                empty={section.empty}
              >
                {section.items.map((item) => section.render(item))}
              </ListContainer>
            )}
          </ContentCard>
        </Box>
      </Stack>

      <ConfirmRejectDialog
        open={Boolean(rejectTarget)}
        menteeName={rejectTarget?.mentee?.fullName}
        pending={rejecting}
        onCancel={closeReject}
        onConfirm={confirmReject}
      />

      <ConfirmDialog
        open={Boolean(approveTarget)}
        title={c.approveSuggested.title}
        body={fillTemplate(c.approveSuggested.body, {
          menteeName: approveTarget?.request?.mentee?.fullName || "",
          slot: approveTarget?.slot
            ? formatDateTimeLabel(approveTarget.slot.startTime, lang)
            : "",
        })}
        confirmLabel={approving ? c.approveSuggested.pending : c.approveSuggested.confirm}
        cancelLabel={c.approveSuggested.cancel}
        confirmColor="primary"
        pending={approving}
        onCancel={closeApprove}
        onConfirm={confirmApprove}
      />

      <ConfirmDialog
        open={Boolean(rescheduleTarget)}
        title={c.reschedule.title}
        body={fillTemplate(c.reschedule.body, {
          menteeName: rescheduleTarget?.mentee?.fullName || "",
        })}
        confirmLabel={rescheduling ? c.reschedule.pending : c.reschedule.confirm}
        cancelLabel={c.reschedule.cancel}
        confirmColor="error"
        pending={rescheduling}
        onCancel={closeReschedule}
        onConfirm={confirmReschedule}
      />

      <CannotAttendMeetingDialog
        open={Boolean(cannotAttendTarget)}
        copy={c.cannotAttendMeeting}
        pending={cannotAttending}
        onCancel={closeCannotAttend}
        onConfirm={confirmCannotAttend}
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
    </Box>
  );
}
