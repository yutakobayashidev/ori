import { useHydrated, useRouteContext } from "@tanstack/react-router";
import { ArrowRight, BookOpen, House, MessagesSquare } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { authRequest } from "./auth-client";
import { AuthFrame } from "./auth-page";

export function OnboardingPage() {
  const hydrated = useHydrated();
  const { auth } = useRouteContext({ from: "__root__" });
  const [name, setName] = useState(auth.owner?.name ?? "");
  const [step, setStep] = useState(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const disabled = pending || !hydrated;

  async function finish() {
    if (disabled) return;
    setPending(true);
    setError("");
    try {
      await authRequest({ action: "onboard", name: name.trim() });
      window.location.assign("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save. Please try again.");
      setPending(false);
    }
  }

  async function signOut() {
    if (disabled) return;
    setPending(true);
    setError("");
    try {
      await authRequest({ action: "logout" });
      window.location.assign("/login");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign out. Please try again.");
      setPending(false);
    }
  }

  function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || !name.trim()) return;
    setStep(2);
  }

  return (
    <AuthFrame>
      <p className="mb-px-16 text-ui-12 text-muted-foreground">{step} of 2</p>
      {step === 1 ? (
        <>
          <header className="mb-px-28">
            <h1 className="text-ui-27 font-book tracking-tight leading-tight wrap-anywhere">
              A little context, to start.
            </h1>
            <p className="mt-px-12 text-ui-14 leading-cozy text-muted-foreground">
              Your day, conversations, and reading, together in one place.
            </p>
          </header>
          <form method="post" className="grid gap-px-20" onSubmit={next}>
            <div className="grid gap-px-9">
              <Label htmlFor="displayName">What should we call you?</Label>
              <Input
                className="h-[40px]"
                id="displayName"
                name="displayName"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="given-name"
                required
                maxLength={80}
                disabled={disabled}
              />
            </div>
            <Button
              type="submit"
              className="mt-[4px] w-full justify-between"
              size="lg"
              disabled={disabled || !name.trim()}
            >
              Continue
              <ArrowRight aria-hidden="true" />
            </Button>
          </form>
        </>
      ) : (
        <>
          <header className="mb-px-28">
            <h1 className="text-ui-27 font-book tracking-tight leading-tight wrap-anywhere">
              Start with today.
            </h1>
            <p className="mt-px-12 text-ui-14 leading-cozy text-muted-foreground">
              You can take it one thing at a time.
            </p>
          </header>
          <ul className="m-0 mb-px-28 grid list-none gap-px-24 p-0">
            <li className="flex items-start gap-px-14">
              <House
                className="mt-px-2 size-[18px] shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div>
                <strong className="text-ui-14 font-medium">A place to begin</strong>
                <p className="mt-[4px] text-ui-13 leading-cozy text-muted-foreground">
                  A brief and flexible tasks help you find your next step.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-px-14">
              <MessagesSquare
                className="mt-px-2 size-[18px] shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div>
                <strong className="text-ui-14 font-medium">Room for the everyday</strong>
                <p className="mt-[4px] text-ui-13 leading-cozy text-muted-foreground">
                  Keep conversations and quick notes close at hand.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-px-14">
              <BookOpen
                className="mt-px-2 size-[18px] shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div>
                <strong className="text-ui-14 font-medium">Follow your curiosity</strong>
                <p className="mt-[4px] text-ui-13 leading-cozy text-muted-foreground">
                  Explore reading and research alongside your day.
                </p>
              </div>
            </li>
          </ul>
          <p className="border-t border-border pt-px-20 text-ui-12 leading-cozy text-muted-foreground">
            Tasks and reply drafts are saved. Routine and journal entries reset on reload; Reader
            and Vitals contain sample data. Add connections from your profile menu whenever you’re
            ready.
          </p>
          <div className="mt-px-26 flex items-center justify-between gap-px-12">
            <Button variant="ghost" onClick={() => setStep(1)} disabled={disabled}>
              Back
            </Button>
            <Button size="lg" onClick={finish} disabled={disabled}>
              {pending ? "Saving…" : "Open workspace"}
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </>
      )}
      {error && (
        <p className="text-ui-13 leading-cozy wrap-anywhere text-destructive" role="alert">
          {error}
        </p>
      )}
      <footer className="mt-px-32 flex items-center justify-between gap-px-12 text-ui-12 text-muted-foreground">
        <span className="min-w-0 wrap-anywhere">{auth.owner?.email}</span>
        <Button variant="ghost" size="sm" onClick={signOut} disabled={disabled}>
          Sign out
        </Button>
      </footer>
    </AuthFrame>
  );
}
