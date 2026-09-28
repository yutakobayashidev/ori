import { getSession, readAuthState } from "./auth.server";
import { sessionToken } from "./http.server";
import { safeReturnTo } from "./return-to";

const publicPaths = new Set(["/login", "/setup", "/api/auth"]);

export function checkSessionAccess(request: Request): Response | null {
  const url = new URL(request.url);
  if (publicPaths.has(url.pathname)) return null;
  const owner = getSession(sessionToken(request));
  if (owner?.onboardingCompletedAt) return null;
  if (owner && url.pathname === "/onboarding") return null;
  const document =
    request.method === "GET" &&
    request.headers.get("accept")?.includes("text/html") &&
    !url.pathname.startsWith("/api/") &&
    !url.pathname.startsWith("/_serverFn/");
  if (document) {
    const location = owner ? "/onboarding" : readAuthState().needsSetup ? "/setup" : "/login";
    return new Response(null, {
      status: 303,
      headers: {
        location:
          location === "/login" && (url.pathname !== "/" || !!url.search)
            ? `/login?${new URLSearchParams({ returnTo: safeReturnTo(url.pathname + url.search) })}`
            : location,
        "cache-control": "no-store",
      },
    });
  }
  return Response.json(
    {
      error: owner ? "Complete onboarding to continue." : "Sign in to continue.",
    },
    { status: owner ? 403 : 401, headers: { "cache-control": "no-store" } },
  );
}
