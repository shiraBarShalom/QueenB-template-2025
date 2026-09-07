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
import { useNavigate } from "react-router-dom";
import PageShell from "../components/PageShell";
import AdminMeetingCalendar from "../components/admin/AdminMeetingCalendar";
import MeetingStatusChip from "../components/admin/MeetingStatusChip";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageProvider";
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
  const { user } = useAuth();
  const { t, locale } = useLanguage();
  const admin = t.admin;
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
    setError(requestError.response?.data?.message || admin.loadError);
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
    <PageShell title={admin.welcome.replace("{name}", user.displayName)} maxWidth={1100}>
      <Stack spacing={3}>
        {error && <Alert severity="error">{error}</Alert>}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          <StatCard label={admin.members} value={stats?.total} />
          <StatCard label={admin.active} value={stats?.active} />
          <StatCard label={admin.mentors} value={stats?.mentors} />
          <StatCard label={admin.admins} value={stats?.admins} />
        </Stack>
        <Tabs
          value={tab}
          onChange={(_, next) => setTab(next)}
          variant="scrollable"
          allowScrollButtonsMobile
        >
          <Tab value="alerts" label={`${admin.alerts} (${alerts.length})`} />
          <Tab value="report" label={admin.report} />
          <Tab value="calendar" label={admin.calendar} />
          <Tab value="users" label={admin.users} />
        </Tabs>

        {tab === "alerts" && (
          <Stack spacing={1.5}>
            {alerts.length === 0 && !loading && (
              <Typography color="text.secondary">{admin.noAlerts}</Typography>
            )}
            {alerts.map((alert, index) => (
              <Alert
                key={`${alert.type}-${alert.requestId || alert.userId}-${index}`}
                severity={alert.severity}
                action={
                  alert.requestId ? (
                    <Button color="inherit" onClick={() => navigate(`/admin/meetings/${alert.requestId}`)}>
                      {admin.open}
                    </Button>
                  ) : alert.userId ? (
                    <Button color="inherit" onClick={() => navigate(`/admin/users/${alert.userId}`)}>
                      {admin.open}
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
                <InputLabel id="status-filter-label">{admin.status}</InputLabel>
                <Select
                  labelId="status-filter-label"
                  label={admin.status}
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <MenuItem value="">{admin.allStatuses}</MenuItem>
                  {REPORT_STATUSES.map((item) => (
                    <MenuItem key={item.value} value={item.value}>
                      {admin.statuses[item.value] || item.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel id="participant-filter-label">{admin.participant}</InputLabel>
                <Select
                  labelId="participant-filter-label"
                  label={admin.participant}
                  value={participantFilter}
                  onChange={(event) => setParticipantFilter(event.target.value)}
                >
                  <MenuItem value="">{admin.allParticipants}</MenuItem>
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
                  <TableCell>{admin.mentee}</TableCell>
                  <TableCell>{admin.mentor}</TableCell>
                  <TableCell>{admin.when}</TableCell>
                  <TableCell>{admin.status}</TableCell>
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
                    <TableCell>{formatDateTime(row.scheduledStart, locale, admin.notScheduled)}</TableCell>
                    <TableCell>
                      <MeetingStatusChip status={row.status} />
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && report.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4}>{admin.noMeetings}</TableCell>
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
                  label={admin.searchLabel}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <Button type="submit" variant="contained">
                  {admin.search}
                </Button>
              </Stack>
            </Box>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>{admin.name}</TableCell>
                  <TableCell>{admin.email}</TableCell>
                  <TableCell>{admin.mentoringGiven}</TableCell>
                  <TableCell>{admin.roles}</TableCell>
                  <TableCell>{admin.status}</TableCell>
                  <TableCell>{admin.onboarding}</TableCell>
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
                          <Chip key={role} size="small" label={role === "MENTOR" ? admin.roleMentor : admin.roleMentee} />
                        ))}
                        {user.isAdmin && <Chip size="small" color="secondary" label={admin.roleAdmin} />}
                      </Stack>
                    </TableCell>
                    <TableCell>{user.isActive ? admin.userActive : admin.userDisabled}</TableCell>
                    <TableCell>{user.onboardingComplete ? admin.onboardingComplete : admin.onboardingProgress}</TableCell>
                  </TableRow>
                ))}
                {!loading && users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>{admin.noAccounts}</TableCell>
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
