import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ForgotPasswordPage from "./ForgotPasswordPage";
import { forgotPassword } from "../api/users";

jest.mock("../api/users", () => ({
  forgotPassword: jest.fn(),
}));

test("submits an email and shows the generic success message", async () => {
  forgotPassword.mockResolvedValue({
    message: "If an account exists for that email, reset instructions were sent.",
  });

  render(<ForgotPasswordPage />);

  await userEvent.type(screen.getByLabelText(/account email/i), "member@example.com");
  await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));

  expect(forgotPassword).toHaveBeenCalledWith("member@example.com");
  expect(
    await screen.findByText("If an account exists for that email, reset instructions were sent.")
  ).toBeInTheDocument();
});
