import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResetPasswordPage from "./ResetPasswordPage";
import { resetPassword } from "../api/users";

jest.mock("../api/users", () => ({
  resetPassword: jest.fn(),
}));

jest.mock("react-router-dom", () => {
  const React = require("react");
  return {
    Link: ({ children, to }) => React.createElement("a", { href: to }, children),
    useSearchParams: () => [
      new URLSearchParams("token=abcdefghijklmnopqrstuvwxyz123456"),
      jest.fn(),
    ],
  };
});

test("requires matching passwords before calling the reset API", async () => {
  resetPassword.mockResolvedValue({ message: "Password reset. You can now sign in." });

  render(<ResetPasswordPage />);

  await userEvent.type(screen.getByLabelText(/new password/i), "brand new password");
  await userEvent.type(screen.getByLabelText(/confirm password/i), "different password");
  await userEvent.click(screen.getByRole("button", { name: /reset password/i }));

  expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
  expect(resetPassword).not.toHaveBeenCalled();
});
