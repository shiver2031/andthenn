// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LoginForm } from "./login-form";

const auth = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(), signInWithPassword: vi.fn(), resetPasswordForEmail: vi.fn(),
}));
vi.mock("../lib/supabase/browser", () => ({ createSupabaseBrowserClient: () => ({ auth }) }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe("login feedback", () => {
  it("shows OAuth errors and allows retry", async () => {
    auth.signInWithOAuth.mockResolvedValue({ error: { message: "Workspace access unavailable." } });
    render(<LoginForm/>);
    fireEvent.click(screen.getByRole("button", { name: /Continue with Google/ }));
    expect(await screen.findByRole("status")).toHaveProperty("textContent", "Workspace access unavailable.");
    expect((screen.getByRole("button", { name: /Continue with Google/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({ provider: "google", options: { redirectTo: `${location.origin}/auth/callback?next=/home` } });
  });

  it("locks a pending password request and retains credentials after failure", async () => {
    let finish!: (result: { error: { message: string } }) => void;
    auth.signInWithPassword.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<LoginForm/>);
    fireEvent.click(screen.getByRole("button", { name: "Temporary collaborator sign in" }));
    fireEvent.change(screen.getByLabelText("Invitation email"), { target: { value: "guest@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "invalid-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect((screen.getByRole("button", { name: "Signing in…" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Use Google Workspace instead" }) as HTMLButtonElement).disabled).toBe(true);
    finish({ error: { message: "Invalid credentials" } });
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Sign-in failed/));
    expect((screen.getByLabelText("Invitation email") as HTMLInputElement).value).toBe("guest@example.test");
    expect(auth.signInWithPassword).toHaveBeenCalledTimes(1);
  });

  it("requires an email before reset and reports reset success without account disclosure", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    render(<LoginForm/>);
    fireEvent.click(screen.getByRole("button", { name: "Temporary collaborator sign in" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
    expect(screen.getByRole("status").textContent).toBe("Enter your invitation email first.");
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Invitation email"), { target: { value: "guest@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("If this invited account exists, a reset email has been sent."));
    fireEvent.click(screen.getByRole("button", { name: "Use Google Workspace instead" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("reports unavailable authentication and reset failures", async () => {
    auth.signInWithOAuth.mockRejectedValue(new Error("Offline"));
    auth.resetPasswordForEmail.mockResolvedValue({ error: { message: "Unavailable" } });
    render(<LoginForm/>);
    fireEvent.click(screen.getByRole("button", { name: /Continue with Google/ }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Google sign-in is not configured."));
    fireEvent.click(screen.getByRole("button", { name: "Temporary collaborator sign in" }));
    fireEvent.change(screen.getByLabelText("Invitation email"), { target: { value: "guest@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Unable to send reset email."));
  });
});
