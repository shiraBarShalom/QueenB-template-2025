import React, { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Alert, Box, Button, Snackbar, Stack, Typography } from "@mui/material";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import MarkEmailReadRoundedIcon from "@mui/icons-material/MarkEmailReadRounded";

import { useLanguage } from "../../i18n/LanguageProvider";
import { useCurrentUser } from "../../auth/useCurrentUser";
import {
  fetchMentorDashboard,
  rejectMentoringRequest,
} from "../../api/mentorScheduling";
import PageHeader from "../../components/app/PageHeader";
import ContentCard from "../../components/app/ContentCard";
import ListContainer from "../../components/app/ListContainer";
import EmptyState from "../../components/app/EmptyState";
import DashboardSummary from "../../components/app/mentor/DashboardSummary";
import IncomingRequestCard from "../../components/app/mentor/IncomingRequestCard";
import ConfirmRejectDialog from "../../components/app/mentor/ConfirmRejectDialog";

/**
 * `/app/mentor-area` — the logged-in mentor's personal scheduling dashboard
 * (Part 2). It shows:
 *   1. a small summary strip of counts derived from the request statuses
 *   2. the requests currently waiting for her (WAITING_FOR_MENTOR_SLOTS)
 *
 * Per incoming request she can Decline (terminal REJECT, gated by a confirm
 * dialog) or go to Propose times (Part 3 entry point). The scheduling state
 * machine lives entirely on the server — this page only calls it and then
 * re-reads the dashboard to reconcile.
 *
 * Identity: the mentor is taken from useCurrentUser() (the app's auth seam),
 * never from a value typed in the UI. `mentorProfileId` reads the dashboard;
 * `id` is sent as `actingUserId` for the reject action and is validated
 * server-side against the request's assigned mentor.
 */
export default function MentorAreaPage() {
  const { t } = useLanguage();
  const c = t.app.mentorArea;
  const { id: actingUserId, mentorProfileId } = useCurrentUser();
  const location = useLocation();
  const navigate = useNavigate();

  const [phase, setPhase] = useState("loading"); // "loading" | "ready" | "error"
  const [errorKind, setErrorKind] = useState(null); // "noProfile" | "load"
  const [data, setData] = useState(null); // { counts, incomingRequests }

  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejecting, setRejecting] = useState(false);
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

  // One-shot success feedback after ProposeSlotsPage navigates back here. The
  // dashboard re-read above already reflects the new WAITING_FOR_MENTEE_SELECTION
  // state; this only surfaces the confirmation. Clear the nav state so a manual
  // refresh doesn't replay it.
  useEffect(() => {
    if (location.state && location.state.flash === "slotsProposed") {
      setToast({ severity: "success", message: c.proposeSlots.successFlash });
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
        // The request moved on (mentor proposed elsewhere / mentee withdrew /
        // already rejected). Do not fake success — reconcile from the server.
        setRejectTarget(null);
        setToast({ severity: "warning", message: c.reject.conflict });
        load({ silent: true });
      } else {
        // Keep the dialog open so she can retry or cancel.
        setToast({ severity: "error", message: c.reject.error });
      }
    } finally {
      setRejecting(false);
    }
  };

  const loading = phase === "loading";
  const requests = data ? data.incomingRequests : [];

  return (
    <Box>
      <PageHeader title={c.title} description={c.description} />

      <Stack spacing={{ xs: 2.5, md: 3 }}>
        <DashboardSummary counts={data ? data.counts : null} loading={loading} />

        <ContentCard title={c.incoming.title}>
          <Typography sx={{ mt: -1, mb: 2, fontSize: "0.9rem", color: "#6d3049" }}>
            {c.incoming.subtitle}
          </Typography>

          {phase === "error" ? (
            <EmptyState
              icon={ErrorOutlineRoundedIcon}
              title={
                errorKind === "noProfile" ? c.incoming.noProfile : c.incoming.loadError
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
              isEmpty={phase === "ready" && requests.length === 0}
              empty={{
                icon: MarkEmailReadRoundedIcon,
                title: c.incoming.emptyTitle,
                hint: c.incoming.emptyHint,
              }}
            >
              {requests.map((request) => (
                <IncomingRequestCard
                  key={request.id}
                  request={request}
                  busy={rejecting && rejectTarget?.id === request.id}
                  onReject={openReject}
                />
              ))}
            </ListContainer>
          )}
        </ContentCard>
      </Stack>

      <ConfirmRejectDialog
        open={Boolean(rejectTarget)}
        menteeName={rejectTarget?.mentee?.fullName}
        pending={rejecting}
        onCancel={closeReject}
        onConfirm={confirmReject}
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
