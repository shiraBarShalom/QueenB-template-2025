import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { Link, useNavigate } from "react-router-dom";
import PageShell from "../components/PageShell";
import AdminMeetingCalendar from "../components/admin/AdminMeetingCalendar";
import MeetingStatusChip from "../components/admin/MeetingStatusChip";
import { useAuth } from "../context/AuthContext";
import { getStats, listAlerts, listCalendar, listReport, listUsers } from "../api/admin";
import { REPORT_STATUSES, formatDateTime } from "../admin/meetingStatus";

function StatCard({ label, value }) {
  return (
    <Paper sx={{ p: 2, minWidth: 140, flex: 1 }}>
      <Typography variant="h4">{value ?? 0}</Typography>
      <Typography color="text.secondary">{label}</Typography>
    </Paper>
  );
}

export default function AdminPage() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("users");
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [report, setReport] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [participantFilter, setParticipantFilter] = useState("");
  const [alerts, setAlerts] = useState([]);
  const [calendar, setCalendar] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const handleAdminError = (requestError) => {
    if (requestError.response?.status === 401) {
      navigate("/login", { replace: true });
      return;
    }
    if (requestError.response?.status === 403) {
      navigate("/home", { replace: true });
      return;
    }
    setError(requestError.response?.data?.message || "Could not load administrator data.");
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getStats(),
      listUsers({ page: page + 1, limit, search: query }),
      listReport({
        status: statusFilter || undefined,
        participantId: participantFilter || undefined,
      }),
      listAlerts(),
      listCalendar(),
    ])
      .then(([nextStats, list, reportData, nextAlerts, nextCalendar]) => {
        if (cancelled) return;
        setStats(nextStats);
        setUsers(list.users);
        setTotal(list.total);
        setReport(reportData.rows || []);
        setParticipants(reportData.participants || []);
        setAlerts(nextAlerts || []);
        setCalendar(nextCalendar || []);
        setError("");
      })
      .catch(handleAdminError)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, limit, query, statusFilter, participantFilter, navigate]);

  return (
    <PageShell title="Administrator dashboard" subtitle="Meetings, members, and situations that need attention." maxWidth={1100}>
      <Stack spacing={3}>
        {error && <Alert severity="error">{error}</Alert>}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          <Button component={Link} to="/home" variant="outlined">
            Home
          </Button>
          <Button onClick={() => signOut().catch(() => setError("Could not sign out."))} color="inherit">
            Sign out
          </Button>
        </Stack>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          <StatCard label="Members" value={stats?.total} />
          <StatCard label="Active" value={stats?.active} />
          <StatCard label="Mentors" value={stats?.mentors} />
          <StatCard label="Admins" value={stats?.admins} />
        </Stack>
        <Tabs
          value={tab}
          onChange={(_, next) => setTab(next)}
          variant="scrollable"
          allowScrollButtonsMobile
        >
          <Tab value="alerts" label={`Alerts (${alerts.length})`} />
          <Tab value="report" label="Meeting report" />
          <Tab value="calendar" label="Calendar" />
          <Tab value="users" label="Users" />
        </Tabs>

        {tab === "alerts" && (
          <Stack spacing={1.5}>
            {alerts.length === 0 && !loading && (
              <Typography color="text.secondary">No situations need attention right now.</Typography>
            )}
            {alerts.map((alert, index) => (
              <Alert
                key={`${alert.type}-${alert.requestId || alert.userId}-${index}`}
                severity={alert.severity}
                action={
                  alert.requestId ? (
                    <Button color="inherit" onClick={() => navigate(`/admin/meetings/${alert.requestId}`)}>
                      Open
                    </Button>
                  ) : alert.userId ? (
                    <Button color="inherit" onClick={() => navigate(`/admin/users/${alert.userId}`)}>
                      Open
                    </Button>
                  ) : null
                }
              >
                <Typography fontWeight={700}>{alert.title}</Typography>
                {alert.body}
              </Alert>
            ))}
          </Stack>
        )}

        {tab === "report" && (
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <FormControl fullWidth>
                <InputLabel id="status-filter-label">Status</InputLabel>
                <Select
                  labelId="status-filter-label"
                  label="Status"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <MenuItem value="">All statuses</MenuItem>
                  {REPORT_STATUSES.map((item) => (
                    <MenuItem key={item.value} value={item.value}>
                      {item.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel id="participant-filter-label">Participant</InputLabel>
                <Select
                  labelId="participant-filter-label"
                  label="Participant"
                  value={participantFilter}
                  onChange={(event) => setParticipantFilter(event.target.value)}
                >
                  <MenuItem value="">All participants</MenuItem>
                  {participants.map((person) => (
                    <MenuItem key={person.id} value={String(person.id)}>
                      {person.displayName} ({person.email})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Mentee</TableCell>
                  <TableCell>Mentor</TableCell>
                  <TableCell>When</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {report.map((row) => (
                  <TableRow
                    key={row.id}
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={() => navigate(`/admin/meetings/${row.id}`)}
                  >
                    <TableCell>{row.mentee?.displayName}</TableCell>
                    <TableCell>{row.mentor?.displayName}</TableCell>
                    <TableCell>{formatDateTime(row.scheduledStart)}</TableCell>
                    <TableCell>
                      <MeetingStatusChip status={row.status} />
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && report.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4}>No meetings match these filters.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Stack>
        )}

        {tab === "calendar" && <AdminMeetingCalendar meetings={calendar} />}

        {tab === "users" && (
          <Stack spacing={2}>
            <Box
              component="form"
              onSubmit={(event) => {
                event.preventDefault();
                setPage(0);
                setQuery(search.trim());
              }}
            >
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <TextField
                  fullWidth
                  label="Search name or email"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <Button type="submit" variant="contained">
                  Search
                </Button>
              </Stack>
            </Box>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Mentoring given</TableCell>
                  <TableCell>Roles</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Onboarding</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((user) => (
                  <TableRow
                    key={user.id}
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={() => navigate(`/admin/users/${user.id}`)}
                  >
                    <TableCell>{user.displayName}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.meetingsAsMentor ?? 0}</TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                        {(user.roles || []).map((role) => (
                          <Chip key={role} size="small" label={role === "MENTOR" ? "Mentor" : "Mentee"} />
                        ))}
                        {user.isAdmin && <Chip size="small" color="secondary" label="Admin" />}
                      </Stack>
                    </TableCell>
                    <TableCell>{user.isActive ? "Active" : "Disabled"}</TableCell>
                    <TableCell>{user.onboardingComplete ? "Complete" : "In progress"}</TableCell>
                  </TableRow>
                ))}
                {!loading && users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>No accounts match this search.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <TablePagination
              component="div"
              count={total}
              page={page}
              onPageChange={(_, nextPage) => setPage(nextPage)}
              rowsPerPage={limit}
              onRowsPerPageChange={(event) => {
                setLimit(Number(event.target.value));
                setPage(0);
              }}
              rowsPerPageOptions={[5, 10, 20]}
            />
          </Stack>
        )}
      </Stack>
    </PageShell>
  );
}
