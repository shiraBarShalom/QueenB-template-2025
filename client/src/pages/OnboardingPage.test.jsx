import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OnboardingPage from "./OnboardingPage";

const mockAuth = {
  user: {
    displayName: "Mor",
    roles: ["MENTEE"],
    profile: {},
    mentorProfile: null,
  },
  setUser: jest.fn(),
};

jest.mock("../context/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

jest.mock("../api/users", () => ({
  updateAccount: jest.fn(),
  updateMentorProfile: jest.fn(),
  updateProfile: jest.fn(),
  updateRoles: jest.fn(),
}));

beforeEach(() => {
  sessionStorage.clear();
  mockAuth.user.roles = ["MENTEE"];
});

test("mentee path does not include mentor setup", () => {
  render(<OnboardingPage />);
  expect(screen.getByText("Your goals")).toBeInTheDocument();
  expect(screen.queryByText("Mentor setup")).not.toBeInTheDocument();
});

test("mentor path adds the mentor setup step", async () => {
  render(<OnboardingPage />);
  await userEvent.click(screen.getByLabelText(/i want to mentor others/i));
  expect(screen.getByText("Mentor setup")).toBeInTheDocument();
});
