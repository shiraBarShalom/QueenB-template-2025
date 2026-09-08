import React from "react";
import { Box } from "@mui/material";

/**
 * Match Queens logo.
 *
 * Renders the brand image asset directly — it is NOT drawn in code.
 * The asset lives at:  client/public/match-queen-logo.png
 * (the "MATCH QUEEN" wordmark with the crown + connector-dots motif that
 * matches the landing palette — a transparent PNG, unlike the older opaque
 * QueenB org mark).
 *
 * This component only sets a height and lets the width scale, so the image
 * keeps its own aspect ratio.
 *
 * Props:
 *   - size   base unit; rendered logo height = size * 1.5 px
 *   - sx     extra styles forwarded to the <img>
 */
const LOGO_SRC = "/match-queen-logo.png";

export default function MatchQueensLogo({ size = 32, sx, ...rest }) {
  return (
    <Box
      component="img"
      src={LOGO_SRC}
      alt="Match Queens"
      sx={{
        height: `${size * 1.5}px`,
        width: "auto",
        display: "block",
        objectFit: "contain",
        ...sx,
      }}
      {...rest}
    />
  );
}
