import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { Link, useNavigate } from "react-router-dom";
import PageShell from "../components/PageShell";
import { useAuth } from "../context/AuthContext";
import { getStats, listUsers } from "../api/admin";

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
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const handleAdminError = (requestError) => {
    if (requestError.response?.status === 401) {
      navigate("/", { replace: true });
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
    ])
      .then(([nextStats, list]) => {
        if (cancelled) return;
        setStats(nextStats);
        setUsers(list.users);
        setTotal(list.total);
        setError("");
      })
      .catch(handleAdminError)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, limit, query, navigate]);

  return (
    <PageShell title="Administrator dashboard" subtitle="Search, review, and manage MentorMe accounts." maxWidth={1100}>
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
                <TableCell colSpan={5}>No accounts match this search.</TableCell>
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
    </PageShell>
  );
}
