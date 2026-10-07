import { ArrowRight, LockKeyhole } from "lucide-react";
import { useHydrated } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { authRequest } from "./auth-client";
import { safeReturnTo } from "./return-to";

export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-svh place-items-center bg-background px-px-24 py-px-48 text-foreground max-[480px]:py-px-32">
      <div className="w-full max-w-[390px] min-w-0">
        <div className="mb-px-44 flex items-center gap-px-9 text-ui-13 text-muted-foreground max-[480px]:mb-px-36">
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
  const hydrated = useHydrated();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const disabled = pending || !hydrated;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
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
      <header className="mb-px-28">
        <h1 className="text-ui-27 font-book tracking-tight leading-tight wrap-anywhere">
          {setup ? "Make yourself at home." : "Welcome back."}
        </h1>
        <p className="mt-px-12 text-ui-14 leading-cozy text-muted-foreground">
          {setup
            ? "Create the owner account for your personal workspace."
            : "Sign in to your personal workspace."}
        </p>
      </header>
      <form method="post" onSubmit={submit} className="grid gap-px-20" aria-busy={pending}>
        {setup && (
          <div className="grid gap-px-9">
            <Label htmlFor="name">Your name</Label>
            <Input
              className="h-[40px]"
              id="name"
              name="name"
              autoComplete="given-name"
              required
              maxLength={80}
              disabled={disabled}
            />
          </div>
        )}
        <div className="grid gap-px-9">
          <Label htmlFor="email">Email address</Label>
          <Input
            className="h-[40px]"
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            maxLength={254}
            disabled={disabled}
          />
        </div>
        <div className="grid gap-px-9">
          <Label htmlFor="password">Password</Label>
          <Input
            className="h-[40px]"
            id="password"
            name="password"
            type="password"
            autoComplete={setup ? "new-password" : "current-password"}
            required
            minLength={setup ? 15 : undefined}
            maxLength={128}
            aria-describedby={setup ? "password-hint" : undefined}
            disabled={disabled}
          />
          {setup && (
            <p id="password-hint" className="text-ui-12 leading-cozy text-muted-foreground">
              Use 15–128 characters. A few memorable words work well.
            </p>
          )}
        </div>
        {setup && (
          <>
            <div className="grid gap-px-9">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                className="h-[40px]"
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={15}
                maxLength={128}
                disabled={disabled}
              />
            </div>
            <div className="grid gap-px-9">
              <Label htmlFor="setupToken">Setup code</Label>
              <Input
                className="h-[40px]"
                id="setupToken"
                name="setupToken"
                type="password"
                autoComplete="off"
                required
                aria-describedby="setup-hint"
                disabled={disabled}
              />
              <p id="setup-hint" className="text-ui-12 leading-cozy text-muted-foreground">
                Use the setup code provided by your server administrator.
              </p>
            </div>
          </>
        )}
        {error && (
          <p className="text-ui-13 leading-cozy wrap-anywhere text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button
          type="submit"
          size="lg"
          disabled={disabled}
          className="mt-[4px] w-full justify-between"
        >
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
      <p className="mt-px-24 text-ui-12 leading-cozy text-muted-foreground">
        {setup
          ? "This workspace has one owner. Connections can be added later."
          : "A private workspace. Access is limited to its owner."}
      </p>
    </AuthFrame>
  );
}
