import React from "react";
import { render, screen } from "@testing-library/react";
import { GuestOnly, RequireAdmin, RequireAuth, RequireOnboarding } from "./RouteGuards";

const mockAuth = { user: null, loading: false };

jest.mock("../context/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

beforeEach(() => {
  mockAuth.user = null;
  mockAuth.loading = false;
});

test("RequireAuth sends guests to sign in", () => {
  render(<RequireAuth><div>Protected</div></RequireAuth>);
  expect(screen.getByText("Redirected to /")).toBeInTheDocument();
});

test("RequireAdmin blocks ordinary members", () => {
  mockAuth.user = { isAdmin: false, profile: { onboardingComplete: true } };
  render(<RequireAdmin><div>Admin only</div></RequireAdmin>);
  expect(screen.getByText("Redirected to /home")).toBeInTheDocument();
});

test("RequireOnboarding sends incomplete profiles to onboarding", () => {
  mockAuth.user = { isAdmin: false, profile: { onboardingComplete: false } };
  render(<RequireOnboarding><div>Home content</div></RequireOnboarding>);
  expect(screen.getByText("Redirected to /onboarding")).toBeInTheDocument();
});

test("GuestOnly sends completed admins to the dashboard", () => {
  mockAuth.user = { isAdmin: true, profile: { onboardingComplete: true } };
  render(<GuestOnly><div>Auth form</div></GuestOnly>);
  expect(screen.getByText("Redirected to /admin")).toBeInTheDocument();
});
