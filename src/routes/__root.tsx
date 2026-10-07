import type { QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  redirect,
  Scripts,
} from "@tanstack/react-router";
import { safeReturnTo } from "#/features/auth/return-to";
import { loadAuthState } from "#/features/auth/session";
import { validateWorkspaceSearch } from "#/features/navigation/search";
import { WorkspaceStateProvider } from "#/features/workspace/workspace-state";
import appCss from "../styles.css?url";

type RouterContext = { queryClient: QueryClient };

export const Route = createRootRouteWithContext<RouterContext>()({
  validateSearch: validateWorkspaceSearch,
  beforeLoad: async ({ location }) => {
    const auth = await loadAuthState();
    const path = location.pathname;
    const entry = path === "/login" || path === "/setup";
    if (!auth.owner && auth.needsSetup && path === "/login") throw redirect({ to: "/setup" });
    if (!auth.owner && !entry)
      throw redirect({
        to: auth.needsSetup ? "/setup" : "/login",
        search:
          !auth.needsSetup && location.href !== "/"
            ? { returnTo: safeReturnTo(location.href) }
            : {},
      });
    if (!auth.owner && path === "/setup" && !auth.needsSetup) throw redirect({ to: "/login" });
    if (auth.owner && !auth.owner.onboardingCompletedAt && path !== "/onboarding")
      throw redirect({ to: "/onboarding" });
    if (auth.owner?.onboardingCompletedAt && (entry || path === "/onboarding"))
      throw redirect({ to: "/" });
    return { auth };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      { name: "referrer", content: "no-referrer" },
      { name: "theme-color", content: "#171717" },
      { name: "apple-mobile-web-app-title", content: "Workspace" },
      { title: "Personal Workspace" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest", crossOrigin: "use-credentials" },
      { rel: "icon", href: "/icons/workspace.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootDocument,
  component: RootContent,
});

function RootContent() {
  return (
    <WorkspaceStateProvider>
      <Outlet />
    </WorkspaceStateProvider>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch((error) => {
        // oxlint-disable-next-line no-console -- Keep registration failures diagnosable without interrupting the app.
        console.error("Service worker registration failed", error);
      });
    }
  }, []);

  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
