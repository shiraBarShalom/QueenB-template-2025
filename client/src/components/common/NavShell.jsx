import React from "react";
import { Box, Container, Drawer } from "@mui/material";

/**
 * Shared, presentational sticky-bar chrome for BOTH the public landing
 * navbar and the authenticated app navbar — so the two areas feel like
 * one product (identical height, blur, border, container width).
 *
 * Desktop layout = three physical zones, direction-aware, using the full
 * container width:
 *
 *   [ startZone ] ....gutter.... [ centerZone ] ....gutter.... [ endZone ]
 *
 *   startZone  — the Match Queen logo   (RTL: far right, LTR: far left)
 *   centerZone — main navigation links  (always horizontally centred)
 *   endZone    — language switcher + login/logout  (opposite edge to the logo)
 *
 * A CSS grid `1fr auto 1fr` pins the side zones to the container edges,
 * keeps the nav links dead-centre, and puts equal gutters between the
 * three zones regardless of their widths.
 *
 * Mobile layout = a simple two-item bar: `mobileStart` (logo + menu
 * trigger) and `mobileEnd` (language switcher), with the links moving
 * into the drawer.
 */

const NAV_HEIGHT = 74;

export default function NavShell({
  startZone,
  centerZone,
  endZone,
  mobileStart,
  mobileEnd,
  drawer,
}) {
  return (
    <Box
      component="header"
      sx={{
        position: "sticky",
        top: 0,
        zIndex: 1100,
        height: NAV_HEIGHT,
        display: "flex",
        alignItems: "center",
        backdropFilter: "blur(12px)",
        backgroundColor: "rgba(255, 251, 249, 0.82)",
        borderBottom: "1px solid rgba(225, 29, 106, 0.12)",
      }}
    >
      <Container maxWidth="lg">
        {/* Desktop: three zones across the full width */}
        <Box
          sx={{
            display: { xs: "none", md: "grid" },
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            columnGap: 3,
            width: "100%",
            height: NAV_HEIGHT,
          }}
        >
          <Box
            sx={{
              justifySelf: "start",
              alignSelf: "stretch",
              display: "flex",
              alignItems: "center",
              minWidth: 0,
            }}
          >
            {startZone}
          </Box>
          <Box
            sx={{
              justifySelf: "center",
              alignSelf: "stretch",
              display: "flex",
              alignItems: "center",
              minWidth: 0,
            }}
          >
            {centerZone}
          </Box>
          <Box
            sx={{
              justifySelf: "end",
              alignSelf: "stretch",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              minWidth: 0,
            }}
          >
            {endZone}
          </Box>
        </Box>

        {/* Mobile: two-item bar */}
        <Box
          sx={{
            display: { xs: "flex", md: "none" },
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
            width: "100%",
            height: NAV_HEIGHT,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", minWidth: 0 }}>{mobileStart}</Box>
          <Box sx={{ display: "flex", alignItems: "center", minWidth: 0 }}>{mobileEnd}</Box>
        </Box>
      </Container>

      {drawer}
    </Box>
  );
}

/**
 * Shared drawer chrome for the mobile navigation of both navbars.
 * Anchor follows direction (start side): right in RTL, left in LTR.
 */
export function NavDrawer({ open, onClose, dir = "rtl", children }) {
  const isRtl = dir === "rtl";
  return (
    <Drawer
      anchor={isRtl ? "right" : "left"}
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: 280,
          p: 2.5,
          direction: isRtl ? "rtl" : "ltr",
          backgroundColor: "#fffdfb",
        },
      }}
    >
      {children}
    </Drawer>
  );
}

export { NAV_HEIGHT };
