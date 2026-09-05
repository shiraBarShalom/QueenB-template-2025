import React from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import { Box, Button, Typography } from "@mui/material";
import { colors, fonts, gradients } from "../theme/tokens";

// Temporary placeholder — full Mentor Profile page is the next Part 2 task.
export default function MentorProfilePage() {
  const { id } = useParams();

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        px: 3,
        background: gradients.page,
      }}
    >
      <Typography
        sx={{
          fontFamily: fonts.display,
          fontWeight: 700,
          fontSize: "1.75rem",
          color: colors.pink[700],
        }}
      >
        Mentor profile
      </Typography>
      <Typography color="text.secondary">
        Profile for mentor #{id} will be built in the next step.
      </Typography>
      <Button component={RouterLink} to="/mentors" variant="outlined">
        Back to mentors
      </Button>
    </Box>
  );
}
