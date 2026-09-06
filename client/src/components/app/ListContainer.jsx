import React from "react";
import { Skeleton, Stack } from "@mui/material";
import EmptyState from "./EmptyState";

/**
 * Vertical list wrapper with a built-in loading / empty / loaded tri-state.
 *
 * Why shared: every list section in the product (mentor results, incoming
 * requests, meetings) has the same three states. Baking the pattern once
 * means the real feature code only provides data + an `empty` config and
 * gets consistent skeletons and empty states for free.
 *
 * Props:
 *   loading        show `skeletonCount` MUI <Skeleton> rows
 *   skeletonCount  number of skeleton rows (default 3)
 *   isEmpty        show the empty state
 *   empty          props forwarded to <EmptyState /> ({ icon, title, hint, action })
 *   children       the rendered list items
 */
export default function ListContainer({
  loading = false,
  skeletonCount = 3,
  isEmpty = false,
  empty,
  spacing = 1.5,
  children,
}) {
  if (loading) {
    return (
      <Stack spacing={spacing}>
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <Skeleton
            key={i}
            variant="rounded"
            height={72}
            sx={{ borderRadius: "14px", bgcolor: "rgba(225,29,106,0.08)" }}
          />
        ))}
      </Stack>
    );
  }

  if (isEmpty) {
    return <EmptyState {...empty} />;
  }

  return <Stack spacing={spacing}>{children}</Stack>;
}
