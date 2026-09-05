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

function Node({ label, sx }) {
  return (
    <Box sx={{ position: "absolute", textAlign: "center", width: 76, ...sx }}>
      <Box
        sx={{
          width: 46,
          height: 46,
          mx: "auto",
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          color: "#fff",
          background: "linear-gradient(140deg, #f472b6, #e11d6a)",
          boxShadow: "0 8px 18px rgba(225,29,106,0.32)",
          border: "2px solid #fff",
        }}
      >
        <PersonRoundedIcon fontSize="small" />
      </Box>
      <Box
        sx={{
          mt: 0.5,
          fontFamily: "var(--mq-font-body)",
          fontWeight: 700,
          fontSize: "0.72rem",
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

      {/* Front: connection card */}
      <Box
        sx={{
          position: "absolute",
          right: "0%",
          bottom: "4%",
          width: 244,
          height: 196,
          transform: "rotate(4deg)",
          borderRadius: 3,
          backgroundColor: "#ffffff",
          border: "1px solid rgba(225,29,106,0.18)",
          boxShadow: "0 30px 70px rgba(159,18,57,0.22)",
          px: 2,
          py: 1.75,
        }}
      >
        <Box
          sx={{
            textAlign: "start",
            fontFamily: "var(--mq-font-body)",
            fontWeight: 700,
            fontSize: "0.8rem",
            color: "#9f1239",
          }}
        >
          {labels.cardTitle}
        </Box>

        <Box sx={{ position: "relative", height: 118, mt: 0.5 }}>
          <Box
            component="svg"
            viewBox="0 0 240 120"
            preserveAspectRatio="none"
            sx={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          >
            <path
              d="M60 30 C 60 78 180 46 180 96"
              fill="none"
              stroke="#f9a8d4"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="2 9"
              style={{ animation: "mqDashFlow 1.2s linear infinite" }}
            />
            <circle cx="120" cy="60" r="5.5" fill="#e11d6a" />
            <circle cx="120" cy="60" r="11" fill="none" stroke="#f9a8d4" strokeWidth="2" />
          </Box>

          <Box
            sx={{
              position: "absolute",
              left: 22,
              top: 6,
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: "#e11d6a",
              offsetPath: 'path("M38 24 C 38 72 158 40 158 90")',
              animation: "mqTravel 3.4s ease-in-out infinite alternate",
            }}
          />

          <Node label={labels.mentee} sx={{ left: 24, top: 0 }} />
          <Node label={labels.mentor} sx={{ left: 144, top: 66 }} />
        </Box>

        <Box
          sx={{
            mt: 0.5,
            display: "inline-flex",
            alignItems: "center",
            gap: 0.5,
            px: 1,
            py: 0.4,
            borderRadius: 999,
            fontFamily: "var(--mq-font-body)",
            fontWeight: 700,
            fontSize: "0.7rem",
            color: "#9f1239",
            backgroundColor: "rgba(225,29,106,0.1)",
          }}
        >
          {labels.matchedBadge}
        </Box>
      </Box>
    </Box>
  );
}
