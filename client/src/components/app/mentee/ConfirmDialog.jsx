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
 * Generic confirmation dialog for the mentee scheduling actions.
 *
 * It only asks — it never knows the transition rules; the backend stays
 * authoritative. While `pending` the dialog can't be dismissed and the confirm
 * button is disabled + shows a spinner, which is what prevents a double submit.
 * `confirmColor="error"` is used for the terminal cases (final CANNOT_ATTEND,
 * WITHDRAW).
 */
export default function ConfirmDialog({
  open = false,
  title,
  body,
  confirmLabel,
  cancelLabel,
  confirmColor = "primary",
  pending = false,
  onConfirm,
  onCancel,
}) {
  const { dir } = useLanguage();

  return (
    <Dialog
      open={open}
      onClose={pending ? undefined : onCancel}
      dir={dir}
      aria-labelledby="mentee-confirm-title"
      aria-describedby="mentee-confirm-body"
      PaperProps={{ sx: { borderRadius: "18px", p: 1, maxWidth: 440 } }}
    >
      <DialogTitle id="mentee-confirm-title" sx={{ fontWeight: 800, color: "#4a1528" }}>
        {title}
      </DialogTitle>
      <DialogContent>
        <DialogContentText
          id="mentee-confirm-body"
          sx={{ color: "#6d3049", lineHeight: 1.7 }}
        >
          {body}
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={onCancel} disabled={pending} sx={{ fontWeight: 700 }}>
          {cancelLabel}
        </Button>
        <Button
          onClick={onConfirm}
          disabled={pending}
          variant="contained"
          color={confirmColor}
          startIcon={pending ? <CircularProgress size={16} color="inherit" /> : null}
          sx={{ fontWeight: 700 }}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
