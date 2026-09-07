import React, { useEffect, useRef, useState } from "react";
import { Box } from "@mui/material";

/**
 * Reveals its children with a subtle fade + rise the first time they scroll
 * into view. Honours prefers-reduced-motion (handled in index.css).
 */
export default function Reveal({ children, delay = 0, sx, ...rest }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || visible) return undefined;

    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <Box
      ref={ref}
      className={`mq-reveal${visible ? " is-visible" : ""}`}
      sx={{ animationDelay: visible ? `${delay}ms` : undefined, ...sx }}
      {...rest}
    >
      {children}
    </Box>
  );
}
