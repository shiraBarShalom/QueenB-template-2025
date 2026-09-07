import React from "react";
import { Box } from "@mui/material";

/**
 * Match Queen logo.
 *
 * Renders the brand image asset directly — it is NOT drawn in code.
 * The asset must exist at:  client/public/match-queen-logo.png
 * (transparent PNG). This component only sets a height and lets the
 * width scale, so the image keeps its own aspect ratio.
 *
 * Props:
 *   - size   base unit; rendered logo height = size * 2.2 px
 *   - sx     extra styles forwarded to the <img>
 */
const LOGO_SRC = "/match-queen-logo.png";

export default function MatchQueensLogo({ size = 26, sx, ...rest }) {
  return (
    <Box
      component="img"
      src={LOGO_SRC}
      alt="Match Queen"
      sx={{
        height: `${size * 2.2}px`,
        width: "auto",
        display: "block",
        objectFit: "contain",
        ...sx,
      }}
      {...rest}
    />
  );
}
