import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  Stack,
  Typography,
} from "@mui/material";

import { useLanguage } from "../../../i18n/LanguageProvider";
import fillTemplate from "../../../utils/fillTemplate";
import { formatDayLabel, formatTimeRange } from "../../../utils/slotTime";
import StatusChip from "../StatusChip";
import MentorHeader from "./MentorHeader";

/**
 * A WAITING_FOR_MENTEE_SELECTION request in the mentee's Personal Area.
 *
 * The mentee picks ONE of the 2–3 proposed times (a radio group — the filled
 * dot is a shape change, never colour alone) and then:
 *   Choose this time   -> SELECT_SLOT  (confirmed by the parent's dialog)
 *   None of these work  -> CANNOT_ATTEND (retry round, or terminal on round 3)
 *   Withdraw request    -> WITHDRAW     (terminal, always confirmed)
 *
 * On the final round (retryCount === 2) the button is NOT disabled — a warning
 * Alert explains that continuing closes the request, and the parent dialog
 * requires an explicit confirmation.
 */
const FINAL_RETRY = 2;

export default function ProposedSlotsCard({
  request,
  disabled = false,
  onSelectSlot,
  onCannotAttend,
  onWithdraw,
}) {
  const { t, lang } = useLanguage();
  const p = t.app.personalArea.scheduling.proposed;

  const slots = (request.proposal && request.proposal.slots) || [];
  const round =
    (request.proposal && request.proposal.roundNumber) || request.retryCount + 1;
  const isFinalRound = request.retryCount >= FINAL_RETRY;

  const [choice, setChoice] = useState("");

  return (
    <Box
      component="article"
      sx={{
        p: { xs: 2, md: 2.25 },
        borderRadius: "16px",
        border: "1px solid rgba(225,29,106,0.14)",
        backgroundColor: "#fff",
      }}
    >
      <MentorHeader
        mentor={request.mentor}
        action={<StatusChip status="pending" label={p.chip} />}
      />

      <Typography sx={{ mt: 1.5, fontSize: "0.85rem", color: "#6d3049" }}>
        {fillTemplate(p.roundLabel, { round })}
      </Typography>

      {isFinalRound && (
        <Alert severity="warning" sx={{ mt: 1 }}>
          {p.finalRoundWarning}
        </Alert>
      )}

      <FormControl
        component="fieldset"
        disabled={disabled}
        sx={{ mt: 1.5, width: "100%" }}
      >
        <FormLabel
          component="legend"
          sx={{
            fontSize: "0.8rem",
            fontWeight: 700,
            color: "#4a1528",
            "&.Mui-focused": { color: "#4a1528" },
          }}
        >
          {p.slotLegend}
        </FormLabel>
        <RadioGroup value={choice} onChange={(e) => setChoice(e.target.value)}>
          {slots.map((slot) => (
            <FormControlLabel
              key={slot.id}
              value={String(slot.id)}
              control={<Radio />}
              sx={{ py: 0.75, alignItems: "center", mx: 0 }}
              label={
                <Typography sx={{ fontWeight: 600, color: "#4a1528" }}>
                  {formatDayLabel(slot.startTime, lang)} ·{" "}
                  {formatTimeRange(slot.startTime, slot.endTime, lang)}
                </Typography>
              }
            />
          ))}
        </RadioGroup>
      </FormControl>

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{ mt: 2 }}
        justifyContent="flex-end"
      >
        <Button
          onClick={onWithdraw}
          disabled={disabled}
          variant="text"
          color="error"
          sx={{ minHeight: 44, fontWeight: 700 }}
        >
          {p.withdrawCta}
        </Button>
        <Button
          onClick={onCannotAttend}
          disabled={disabled}
          variant="outlined"
          sx={{ minHeight: 44, fontWeight: 700 }}
        >
          {p.cannotAttendCta}
        </Button>
        <Button
          onClick={() => onSelectSlot(Number(choice))}
          disabled={disabled || !choice}
          variant="contained"
          sx={{ minHeight: 44, fontWeight: 700 }}
        >
          {p.chooseCta}
        </Button>
      </Stack>
    </Box>
  );
}
