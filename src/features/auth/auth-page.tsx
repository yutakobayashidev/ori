import { ArrowRight, LockKeyhole } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { authRequest } from "./auth-client";
import { safeReturnTo } from "./return-to";

export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className="auth-page">
      <div className="auth-panel">
        <div className="auth-brand">
          <LockKeyhole size={16} aria-hidden="true" />
          Personal Workspace
        </div>
        {children}
      </div>
    </main>
  );
}

export function LoginPage() {
  return <CredentialsForm setup={false} />;
}

export function SetupPage() {
  return <CredentialsForm setup />;
}

function formText(data: FormData, name: string) {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

function CredentialsForm({ setup }: { setup: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    const email = formText(data, "email").trim();
    const password = formText(data, "password");
    if (setup && password !== data.get("confirmPassword")) {
      setError("Passwords do not match.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const state = await authRequest(
        setup
          ? {
              action: "setup",
              email,
              password,
              name: formText(data, "name").trim(),
              setupToken: formText(data, "setupToken").trim(),
            }
          : { action: "login", email, password },
      );
      if (!state.owner?.onboardingCompletedAt) {
        window.location.assign("/onboarding");
        return;
      }
      const returnTo = new URLSearchParams(window.location.search).get("returnTo");
      window.location.assign(safeReturnTo(returnTo));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in. Please try again.");
      setPending(false);
    }
  }

  return (
    <AuthFrame>
      <header className="auth-heading">
        <h1>{setup ? "Make yourself at home." : "Welcome back."}</h1>
        <p>
          {setup
            ? "Create the owner account for your personal workspace."
            : "Sign in to your personal workspace."}
        </p>
      </header>
      <form onSubmit={submit} className="auth-form" aria-busy={pending}>
        {setup && (
          <div className="auth-field">
            <Label htmlFor="name">Your name</Label>
            <Input
              id="name"
              name="name"
              autoComplete="given-name"
              required
              maxLength={80}
              disabled={pending}
            />
          </div>
        )}
        <div className="auth-field">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            maxLength={254}
            disabled={pending}
          />
        </div>
        <div className="auth-field">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={setup ? "new-password" : "current-password"}
            required
            minLength={setup ? 15 : undefined}
            maxLength={128}
            aria-describedby={setup ? "password-hint" : undefined}
            disabled={pending}
          />
          {setup && (
            <p id="password-hint" className="auth-hint">
              Use 15–128 characters. A few memorable words work well.
            </p>
          )}
        </div>
        {setup && (
          <>
            <div className="auth-field">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={15}
                maxLength={128}
                disabled={pending}
              />
            </div>
            <div className="auth-field">
              <Label htmlFor="setupToken">Setup code</Label>
              <Input
                id="setupToken"
                name="setupToken"
                type="password"
                autoComplete="off"
                required
                aria-describedby="setup-hint"
                disabled={pending}
              />
              <p id="setup-hint" className="auth-hint">
                Use the setup code provided by your server administrator.
              </p>
            </div>
          </>
        )}
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" disabled={pending} className="auth-submit">
          {pending
            ? setup
              ? "Creating account…"
              : "Signing in…"
            : setup
              ? "Create account"
              : "Sign in"}
          <ArrowRight aria-hidden="true" />
        </Button>
      </form>
      <p className="auth-footnote">
        {setup
          ? "This workspace has one owner. Connections can be added later."
          : "A private workspace. Access is limited to its owner."}
      </p>
    </AuthFrame>
  );
}
