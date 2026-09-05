import React from "react";
import { Box } from "@mui/material";

/**
 * Original Match Queen mark — inline SVG + CSS, nothing traced or copied
 * from the QueenB logo.
 *
 * Structure is deliberately close to QueenB's own lockup: one wide,
 * simple bracket shape centered above the wordmark — but the bracket
 * here is an original two-stroke shape (not a copy) and the text reads
 * "Match Queen".
 *
 * Props:
 *   - size   the bracket's rendered height in px (the text scales with it)
 *   - tone   "brand" (pink/burgundy on light) | "light" (white, for dark backgrounds)
 */
function BracketMark({ size, tone }) {
  const color = tone === "light" ? "#ffffff" : "#9f1239";

  return (
    <Box
      component="svg"
      viewBox="0 0 200 70"
      aria-hidden="true"
      sx={{ width: `${size * 2.8}px`, height: "auto", display: "block" }}
    >
      <path
        d="M20 55 C20 22 54 9 92 9"
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M180 55 C180 22 146 9 108 9"
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
      />
    </Box>
  );
}

export default function MatchQueensLogo({ size = 26, tone = "brand", sx, ...rest }) {
  const textColor = tone === "light" ? "#ffffff" : "#4a1528";

  return (
    <Box
      sx={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        gap: `${size * 0.12}px`,
        userSelect: "none",
        lineHeight: 1,
        ...sx,
      }}
      {...rest}
    >
      <BracketMark size={size} tone={tone} />
      <Box
        component="span"
        sx={{
          fontFamily: '"Rubik", "Heebo", sans-serif',
          fontWeight: 700,
          fontSize: `${size * 0.58}px`,
          letterSpacing: "0.01em",
          color: textColor,
          whiteSpace: "nowrap",
        }}
      >
        Match Queen
      </Box>
    </Box>
  );
}
