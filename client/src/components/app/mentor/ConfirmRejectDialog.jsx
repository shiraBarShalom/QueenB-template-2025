import React from "react";
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";

import { useLanguage } from "../../../i18n/LanguageProvider";

/**
 * Confirmation gate for the terminal REJECT action.
 *
 * REJECT ends the request for good (REJECTED is terminal in the Part 1 state
 * machine), so it must never fire on a single click — this dialog is the
 * required "are you sure, this can't be undone" step. The dialog does NOT know
 * the transition rules; it only asks. The backend
 * (schedulingService.reject) stays authoritative.
 *
 * While `pending` is true the dialog can't be dismissed and the confirm button
 * is disabled + shows a spinner, which is what prevents a duplicate submit.
 */
export default function ConfirmRejectDialog({
  open,
  menteeName,
  pending = false,
  onCancel,
  onConfirm,
}) {
  const { t, dir } = useLanguage();
  const c = t.app.mentorArea.reject;

  return (
    <Dialog
      open={open}
      onClose={pending ? undefined : onCancel}
      dir={dir}
      aria-labelledby="reject-dialog-title"
      aria-describedby="reject-dialog-body"
      PaperProps={{ sx: { borderRadius: "18px", p: 1, maxWidth: 420 } }}
    >
      <DialogTitle id="reject-dialog-title" sx={{ fontWeight: 800, color: "#4a1528" }}>
        {c.title}
      </DialogTitle>
      <DialogContent>
        <DialogContentText id="reject-dialog-body" sx={{ color: "#6d3049", lineHeight: 1.7 }}>
          {menteeName ? `${menteeName} — ` : ""}
          {c.body}
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={onCancel} disabled={pending} sx={{ fontWeight: 700 }}>
          {c.cancel}
        </Button>
        <Button
          onClick={onConfirm}
          disabled={pending}
          variant="contained"
          color="error"
          startIcon={
            pending ? <CircularProgress size={16} color="inherit" /> : null
          }
          sx={{ fontWeight: 700 }}
        >
          {pending ? c.pending : c.confirm}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
