import React, { useEffect, useState } from "react";
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
} from "@mui/material";

import { useLanguage } from "../../i18n/LanguageProvider";
import fillTemplate from "../../utils/fillTemplate";

/**
 * Shared confirmation for the post-reschedule-limit "I can't attend the
 * meeting" action (Part 15), used by BOTH the mentee section and the mentor
 * page. It asks for a REQUIRED free-text reason for the other side and only
 * calls `onConfirm(trimmedReason)` once that reason is valid.
 *
 * Length bounds mirror services/schedulingService.js
 * (MIN/MAX_CANNOT_ATTEND_REASON); the backend re-validates, so this is UX only.
 * While `pending` the dialog can't be dismissed and confirm is disabled +
 * spinner — the double-submit guard.
 *
 * `copy` is the i18n block for the acting side:
 *   mentee -> t.app.personalArea.scheduling.confirmCannotAttendMeeting
 *   mentor -> t.app.mentorArea.cannotAttendMeeting
 * (both carry title / body / fieldLabel / fieldPlaceholder / confirm / cancel /
 * tooShort / tooLong).
 */
export const MIN_REASON = 10;
export const MAX_REASON = 500;

export default function CannotAttendMeetingDialog({
  open = false,
  copy,
  pending = false,
  onConfirm,
  onCancel,
}) {
  const { dir } = useLanguage();
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);

  // Reset every time the dialog is (re)opened so a previous draft never leaks.
  useEffect(() => {
    if (open) {
      setText("");
      setTouched(false);
    }
  }, [open]);

  const trimmed = text.trim();
  const tooShort = trimmed.length < MIN_REASON;
  const tooLong = trimmed.length > MAX_REASON;
  const invalid = tooShort || tooLong;
  const showError = touched && invalid;
  const helperText = !showError
    ? " "
    : tooShort
    ? fillTemplate(copy.tooShort, { min: MIN_REASON })
    : fillTemplate(copy.tooLong, { max: MAX_REASON });

  const submit = () => {
    setTouched(true);
    if (invalid || pending) return;
    onConfirm(trimmed);
  };

  return (
    <Dialog
      open={open}
      onClose={pending ? undefined : onCancel}
      dir={dir}
      aria-labelledby="cannot-attend-meeting-title"
      PaperProps={{ sx: { borderRadius: "18px", p: 1, maxWidth: 480 } }}
    >
      <DialogTitle id="cannot-attend-meeting-title" sx={{ fontWeight: 800, color: "#4a1528" }}>
        {copy.title}
      </DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ color: "#6d3049", lineHeight: 1.7, mb: 2 }}>
          {copy.body}
        </DialogContentText>
        <TextField
          label={copy.fieldLabel}
          placeholder={copy.fieldPlaceholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => setTouched(true)}
          multiline
          minRows={3}
          maxRows={7}
          fullWidth
          required
          disabled={pending}
          error={showError}
          helperText={helperText}
          inputProps={{ maxLength: MAX_REASON + 40, "aria-label": copy.fieldLabel }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={onCancel} disabled={pending} sx={{ fontWeight: 700 }}>
          {copy.cancel}
        </Button>
        <Button
          onClick={submit}
          disabled={pending || (touched && invalid)}
          variant="contained"
          color="error"
          startIcon={pending ? <CircularProgress size={16} color="inherit" /> : null}
          sx={{ fontWeight: 700 }}
        >
          {copy.confirm}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
