import React from "react";
import { Box } from "@mui/material";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";

/*
 * Original hero illustration — no stock images.
 * A layered "code window" behind a "connection" card that links a mentee
 * and a mentor.
 */

const KW = { color: "#be185d" };
const FN = { color: "#e11d6a" };
const CM = { color: "#b05a75", fontStyle: "italic" };
const PU = { color: "#8b3a55" };
const TX = { color: "#4a1528" };

const DEFAULT_LABELS = {
  mentee: "מנטית",
  mentor: "מנטורית",
  menteeComment: "// מנטית",
  mentorComment: "// מנטורית",
  cardTitle: "התאמה חדשה",
  matchedBadge: "מותאמות ✓",
};

function Node({ label, size = 46, sx }) {
  const big = size >= 54;
  return (
    <Box sx={{ position: "absolute", textAlign: "center", width: size * 2, ...sx }}>
      <Box
        sx={{
          width: size,
          height: size,
          mx: "auto",
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          color: "#fff",
          background: "linear-gradient(140deg, #f472b6, #e11d6a)",
          boxShadow: "0 0 0 6px rgba(244,114,182,0.15), 0 10px 22px rgba(225,29,106,0.24)",
          border: "2px solid #fffdfb",
        }}
      >
        <PersonRoundedIcon fontSize={big ? "medium" : "small"} />
      </Box>
      <Box
        sx={{
          mt: 0.6,
          fontFamily: "var(--mq-font-body)",
          fontWeight: 700,
          fontSize: big ? "0.82rem" : "0.72rem",
          color: "#6d3049",
        }}
      >
        {label}
      </Box>
    </Box>
  );
}

export default function HeroArt({ labels = DEFAULT_LABELS }) {
  return (
    <Box
      aria-hidden="true"
      sx={{
        position: "relative",
        width: "100%",
        maxWidth: 460,
        mx: "auto",
        aspectRatio: "1 / 1",
        minHeight: 360,
      }}
    >
      {/* One large, subtle curly-brace accent — kept quiet and out of the way */}
      <Box
        aria-hidden="true"
        sx={{
          position: "absolute",
          top: "0%",
          left: "6%",
          fontFamily: '"Fira Code", ui-monospace, monospace',
          fontWeight: 500,
          fontSize: 40,
          color: "rgba(225, 29, 106, 0.22)",
          "--mq-rot": "-8deg",
          transform: "rotate(-8deg)",
          animation: "mqFloat 8s ease-in-out infinite",
          pointerEvents: "none",
        }}
      >
        {"{ }"}
      </Box>

      {/* Back: code window */}
      <Box
        dir="ltr"
        sx={{
          position: "absolute",
          top: "6%",
          left: "2%",
          width: "80%",
          transform: "rotate(-5deg)",
          borderRadius: 3,
          overflow: "hidden",
          backgroundColor: "#fffdfb",
          border: "1px solid rgba(225,29,106,0.16)",
          boxShadow: "0 26px 60px rgba(159,18,57,0.18)",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            px: 1.5,
            py: 1,
            borderBottom: "1px solid rgba(225,29,106,0.12)",
            backgroundColor: "rgba(255,241,245,0.7)",
          }}
        >
          {["#fda4af", "#f472b6", "#e11d6a"].map((c) => (
            <Box key={c} sx={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: c }} />
          ))}
          <Box
            sx={{
              ml: "auto",
              fontFamily: '"Fira Code", monospace',
              fontSize: 11,
              color: "#b05a75",
            }}
          >
            match.js
          </Box>
        </Box>
        <Box
          component="pre"
          sx={{
            m: 0,
            p: 2,
            fontFamily: '"Fira Code", ui-monospace, monospace',
            fontSize: { xs: 11, sm: 12.5 },
            lineHeight: 1.9,
            whiteSpace: "pre",
            overflow: "hidden",
          }}
        >
          <span style={KW}>const</span> <span style={TX}>queens</span> <span style={PU}>=</span>{" "}
          <span style={FN}>matchQueens</span>
          <span style={PU}>();</span>
          {"\n\n"}
          <span style={KW}>const</span> <span style={TX}>pair</span> <span style={PU}>=</span>{" "}
          <span style={FN}>connect</span>
          <span style={PU}>(</span>
          {"\n"}
          {"  "}
          <span style={TX}>mentee</span>
          <span style={PU}>,</span> <span style={CM}>{labels.menteeComment}</span>
          {"\n"}
          {"  "}
          <span style={TX}>mentor</span>
          <span style={PU}>,</span> <span style={CM}>{labels.mentorComment}</span>
          {"\n"}
          <span style={PU}>);</span>
          {"\n\n"}
          <span style={TX}>pair</span>
          <span style={PU}>.</span>
          <span style={FN}>grow</span>
          <span style={PU}>();</span> <span style={{ color: "#c9a24b" }}>✦</span>
        </Box>
      </Box>

      {/* Front: enlarged floating mentee–mentor connection — no card, sits on the hero bg */}
      <Box
        sx={{
          position: "absolute",
          right: "-2%",
          bottom: "0%",
          width: 328,
          height: 250,
          transform: "rotate(3deg)",
        }}
      >
        <Box
          sx={{
            textAlign: "start",
            fontFamily: "var(--mq-font-body)",
            fontWeight: 700,
            fontSize: "0.72rem",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "rgba(159,18,57,0.55)",
            mb: 1,
          }}
        >
          {labels.cardTitle}
        </Box>

        <Box sx={{ position: "relative", width: "100%", height: 210 }}>
          <Box
            component="svg"
            viewBox="0 0 328 210"
            preserveAspectRatio="none"
            sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
          >
            <path
              d="M70 54 C 82 140 250 78 250 106"
              fill="none"
              stroke="#f9a8d4"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeDasharray="2.5 11"
              style={{ animation: "mqDashFlow 1.2s linear infinite" }}
            />
            <circle cx="158" cy="98" r="8" fill="#e11d6a" />
            <circle cx="158" cy="98" r="15" fill="none" stroke="#f9a8d4" strokeWidth="2.5" />
            <g
              style={{
                offsetPath: 'path("M70 54 C 82 140 250 78 250 106")',
                animation: "mqTravel 3.4s ease-in-out infinite alternate",
              }}
            >
              <circle cx="0" cy="0" r="6" fill="#e11d6a" />
            </g>
          </Box>

          <Node label={labels.mentee} size={58} sx={{ left: 12, top: 0 }} />
          <Node label={labels.mentor} size={58} sx={{ left: 192, top: 96 }} />
        </Box>
      </Box>
    </Box>
  );
}
