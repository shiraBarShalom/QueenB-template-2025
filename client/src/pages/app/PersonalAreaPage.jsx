import React, { useState } from "react";
import { Box, Snackbar, Alert, Stack } from "@mui/material";

import { useLanguage } from "../../i18n/LanguageProvider";
import { useAuth } from "../../context/AuthContext";
import fillTemplate from "../../utils/fillTemplate";
import PageHeader from "../../components/app/PageHeader";
import PersonalProfileCard from "../../components/app/PersonalProfileCard";
import EditProfileDialog from "../../components/app/EditProfileDialog";
import MenteeStats from "../../components/app/mentee/MenteeStats";
import MenteeSchedulingSection from "../../components/app/mentee/MenteeSchedulingSection";

/**
 * `/app/personal-area` — the mentee's personal hub.
 *
 *   - a friendly personalized greeting (real authenticated name)
 *   - a real account card (name / email / job / links / tags) with a working
 *     "Edit profile" that persists via PATCH /api/users/me
 *   - a small real-data stats strip (MenteeStats)
 *   - the existing, untouched MenteeSchedulingSection
 */
function firstName(name) {
  return (name || "").trim().split(/\s+/)[0] || "";
}

export default function PersonalAreaPage() {
  const { t } = useLanguage();
  const c = t.app.personalArea;
  const { user, setUser } = useAuth();

  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState(null);

  const handleSaved = (updatedUser) => {
    if (updatedUser) setUser(updatedUser);
    setEditing(false);
    setToast({ severity: "success", message: c.account.saveSuccess });
  };

  return (
    <Box>
      <PageHeader
        title={fillTemplate(c.greeting, { name: firstName(user?.displayName || user?.fullName) })}
        description={c.description}
      />

      <Stack spacing={{ xs: 2.5, md: 3 }}>
        <MenteeStats />

        <PersonalProfileCard user={user} onEdit={() => setEditing(true)} />

        {/* Scheduling — self-contained: pending, scheduled, past/cancelled. */}
        <MenteeSchedulingSection />
      </Stack>

      <EditProfileDialog
        open={editing}
        user={user}
        onClose={() => setEditing(false)}
        onSaved={handleSaved}
      />

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={4000}
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
