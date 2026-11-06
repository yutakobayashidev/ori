import { ArrowRight, LockKeyhole } from "lucide-react";
import { type ReactNode } from "react";
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

export function LoginPage({ returnTo }: { returnTo?: string }) {
  const destination = safeReturnTo(returnTo);
  const href =
    destination === "/"
      ? "/api/auth/login"
      : `/api/auth/login?${new URLSearchParams({ returnTo: destination })}`;
  return (
    <AuthFrame>
      <header className="mb-px-28">
        <h1 className="text-ui-27 font-book tracking-tight leading-tight wrap-anywhere">
          Welcome back.
        </h1>
        <p className="mt-px-12 text-ui-14 leading-cozy text-muted-foreground">
          Sign in to your personal workspace with Pocket ID.
        </p>
      </header>
      <a
        href={href}
        className="flex min-h-[44px] items-center justify-between rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
      >
        Sign in with Pocket ID <ArrowRight size={16} aria-hidden="true" />
      </a>
      <p className="mt-px-24 text-ui-12 leading-cozy text-muted-foreground">
        A private workspace. Access is limited to its owner.
      </p>
    </AuthFrame>
  );
}
