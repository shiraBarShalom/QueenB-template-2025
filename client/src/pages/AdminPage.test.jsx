import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "../i18n/LanguageProvider";
import AdminPage from "./AdminPage";
import { getStats, listAlerts, listCalendar, listReport, listUsers } from "../api/admin";

jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: { displayName: "Mor Shay", isAdmin: true },
    signOut: jest.fn(),
  }),
}));

jest.mock("../api/admin", () => ({
  getStats: jest.fn(),
  listUsers: jest.fn(),
  listAlerts: jest.fn(),
  listReport: jest.fn(),
  listCalendar: jest.fn(),
}));

test("renders administrator stats and the user table", async () => {
  window.localStorage.setItem("matchqueens.lang", "en");
  getStats.mockResolvedValue({ total: 2, active: 2, mentors: 1, admins: 1 });
  listUsers.mockResolvedValue({
    total: 1,
    page: 1,
    limit: 10,
    users: [
      {
        id: 7,
        displayName: "Mor Shay",
        email: "mor@example.com",
        roles: ["MENTEE"],
        isAdmin: false,
        isActive: true,
        onboardingComplete: true,
        meetingsAsMentor: 3,
      },
    ],
  });
  listAlerts.mockResolvedValue([]);
  listReport.mockResolvedValue({ rows: [], participants: [] });
  listCalendar.mockResolvedValue([]);

  render(
    <LanguageProvider>
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>
    </LanguageProvider>
  );

  expect(await screen.findByText("Mor Shay")).toBeInTheDocument();
  expect(screen.getByText("mor@example.com")).toBeInTheDocument();
  expect(screen.getByText("Members")).toBeInTheDocument();
  expect(screen.getByText("3")).toBeInTheDocument();
});
