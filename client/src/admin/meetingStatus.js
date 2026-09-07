export const REPORT_STATUSES = [
  {
    value: "WAITING_FOR_MENTOR_SLOTS",
    label: "Waiting for mentor to offer times",
    color: "#d97706",
    background: "#fef3c7",
  },
  {
    value: "WAITING_FOR_MENTEE_SELECTION",
    label: "Waiting for mentee to choose a time",
    color: "#a16207",
    background: "#fde68a",
  },
  {
    value: "MATCHED",
    label: "Meeting matched",
    color: "#1d4ed8",
    background: "#dbeafe",
  },
  {
    value: "ATTENDANCE_CONFIRMED",
    label: "Attendance confirmed",
    color: "#6d28d9",
    background: "#ede9fe",
  },
  {
    value: "COMPLETED",
    label: "Meeting took place",
    color: "#15803d",
    background: "#dcfce7",
  },
  {
    value: "NOT_COMPLETED",
    label: "Meeting did not take place",
    color: "#b91c1c",
    background: "#fee2e2",
  },
  {
    value: "FEEDBACK_COMPLETED",
    label: "Feedback submitted",
    color: "#0f766e",
    background: "#ccfbf1",
  },
];

const byValue = Object.fromEntries(REPORT_STATUSES.map((item) => [item.value, item]));

export function statusMeta(status) {
  return (
    byValue[status] || {
      value: status,
      label: status,
      color: "#9d174d",
      background: "#fce7f3",
    }
  );
}

export function formatDateTime(value, locale = "en-US", emptyLabel = "Not scheduled yet") {
  if (!value) return emptyLabel;
  return new Date(value).toLocaleString(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
