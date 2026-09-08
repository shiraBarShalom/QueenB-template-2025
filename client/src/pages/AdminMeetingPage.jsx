import React, { useEffect, useState } from "react";
import { Alert, Button, Paper, Stack, Typography } from "@mui/material";
import { Link, useNavigate, useParams } from "react-router-dom";
import PageShell from "../components/PageShell";
import MeetingStatusChip from "../components/admin/MeetingStatusChip";
import { getReport } from "../api/admin";
import { formatDateTime } from "../admin/meetingStatus";

function PersonCard({ title, person }) {
  if (!person) return null;
  return (
    <Paper sx={{ p: 2, flex: 1 }}>
      <Typography variant="subtitle2" color="text.secondary">
        {title}
      </Typography>
      <Typography variant="h6">{person.displayName}</Typography>
      <Typography>{person.email}</Typography>
      {person.jobTitle && <Typography color="text.secondary">{person.jobTitle}</Typography>}
      {person.company && <Typography color="text.secondary">{person.company}</Typography>}
      {person.background && (
        <Typography sx={{ mt: 1 }} color="text.secondary">
          {person.background}
        </Typography>
      )}
      <Button component={Link} to={`/admin/users/${person.id}`} sx={{ mt: 1 }}>
        Open profile
      </Button>
    </Paper>
  );
}

export default function AdminMeetingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getReport(id)
      .then((row) => {
        setMeeting(row);
        setError("");
      })
      .catch((requestError) => {
        if (requestError.response?.status === 401) {
          navigate("/login", { replace: true });
          return;
        }
        if (requestError.response?.status === 403) {
          navigate("/app", { replace: true });
          return;
        }
        setError(requestError.response?.data?.message || "Could not load this meeting.");
      });
  }, [id, navigate]);

  return (
    <PageShell title="Meeting details" subtitle="Participants, schedule, status, and feedback." maxWidth={900}>
      <Stack spacing={2}>
        {error && <Alert severity="error">{error}</Alert>}
        {meeting && (
          <>
            <Stack direction="row" spacing={1} alignItems="center">
              <MeetingStatusChip status={meeting.status} />
              <Typography color="text.secondary">{formatDateTime(meeting.scheduledStart)}</Typography>
            </Stack>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
              <PersonCard title="Mentee" person={meeting.mentee} />
              <PersonCard title="Mentor" person={meeting.mentor} />
            </Stack>
            <Paper sx={{ p: 2 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Scheduled time
              </Typography>
              <Typography>
                {meeting.scheduledStart
                  ? `${formatDateTime(meeting.scheduledStart)} – ${formatDateTime(meeting.scheduledEnd)}`
                  : "Times have not been chosen yet."}
              </Typography>
            </Paper>
            <Paper sx={{ p: 2 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                Feedback
              </Typography>
              {(meeting.feedback || []).length === 0 ? (
                <Typography color="text.secondary">No feedback yet.</Typography>
              ) : (
                <Stack spacing={1.5}>
                  {meeting.feedback.map((entry) => (
                    <Paper key={entry.id} sx={{ p: 1.5 }}>
                      <Typography fontWeight={700}>{entry.authorName}</Typography>
                      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                        {typeof entry.answers === "string"
                          ? entry.answers
                          : JSON.stringify(entry.answers, null, 2)}
                      </Typography>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Paper>
          </>
        )}
        <Button component={Link} to="/admin" color="inherit">
          Back to administrator dashboard
        </Button>
      </Stack>
    </PageShell>
  );
}
