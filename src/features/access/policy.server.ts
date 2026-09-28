type AccessConfig = { origin: string } & (
  | { mode: "tailscale"; allowedLogin: string }
  | { mode: "none" }
);

export function readAccessConfig(): AccessConfig | null {
  const origin = process.env.TWITTER_LITE_ORIGIN;
  const mode = process.env.TWITTER_LITE_AUTH_MODE ?? "tailscale";
  const allowedLogin = process.env.TWITTER_LITE_ALLOWED_LOGIN;
  if (!origin || (mode !== "tailscale" && mode !== "none")) return null;
  try {
    const url = new URL(origin);
    const secure = url.protocol === "https:";
    const local = url.protocol === "http:" && url.hostname === "127.0.0.1";
    if ((!secure && !local) || url.origin !== origin) return null;
    if (mode === "none") return { origin, mode };
    if (!allowedLogin?.trim()) return null;
    return { origin, mode, allowedLogin };
  } catch {
    return null;
  }
}

/** Use loopback behind Serve for identity, or a private network for mode none. */
export function checkAccess(request: Request, config: AccessConfig | null): Response | null {
  if (!config) {
    return new Response("Access configuration is required.", { status: 503 });
  }
  if (
    config.mode === "tailscale" &&
    request.headers.get("Tailscale-User-Login") !== config.allowedLogin
  ) {
    return new Response("Forbidden", { status: 403 });
  }
  if (
    !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
    request.headers.get("Origin") !== config.origin
  ) {
    return new Response("Forbidden", { status: 403 });
  }
  return null;
}
