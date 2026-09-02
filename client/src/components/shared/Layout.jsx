import React from "react";
import { Link as RouterLink } from "react-router-dom";
import { AppBar, Toolbar, Typography, Button, Container, Box, Stack } from "@mui/material";
import FavoriteIcon from "@mui/icons-material/Favorite";

// Shared page shell: Navbar + content container.
// Wrap any page's content with <Layout> to get consistent chrome across the app.
export default function Layout({ children }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <AppBar position="static" color="primary">
        <Toolbar>
          <FavoriteIcon sx={{ mr: 1 }} />
          <Typography
            variant="h6"
            component={RouterLink}
            to="/"
            sx={{
              flexGrow: 1,
              fontWeight: 700,
              color: "inherit",
              textDecoration: "none",
            }}
          >
            Match Queens
          </Typography>

          <Stack direction="row" spacing={1}>
            <Button color="inherit" component={RouterLink} to="/mentors">
              Find a Mentor
            </Button>
            <Button color="inherit" component={RouterLink} to="/profile">
              My Profile
            </Button>
            <Button
              variant="outlined"
              color="inherit"
              component={RouterLink}
              to="/login"
              sx={{ borderColor: "rgba(255,255,255,0.6)" }}
            >
              Log In
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>

      <Container component="main" maxWidth="lg" sx={{ flexGrow: 1, py: 4 }}>
        {children}
      </Container>
    </Box>
  );
}
