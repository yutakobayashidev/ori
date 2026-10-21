import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";

const health = createMiddleware().server(({ request, next }) => {
  if (request.method === "GET" && new URL(request.url).pathname === "/health") {
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  }
  return next();
});

// Private MCP clients do not carry browser sessions.
// Handle only these exact endpoints ahead of browser-only access checks.
const mcp = createMiddleware().server(async ({ request, next }) => {
  const path = new URL(request.url).pathname;
  // Explicitly report that this private endpoint does not advertise OAuth.
  if (
    ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"].includes(
      path,
    )
  )
    return new Response(null, { status: 404 });
  if (path !== "/mcp") return next();
  const { handleMcpRequest } = await import("./features/mcp/http.server");
  return handleMcpRequest(request);
});

const ownerAccess = createMiddleware().server(async ({ request, next }) => {
  const { checkAccess, readAccessConfig } = await import("./features/access/policy.server");
  return checkAccess(request, readAccessConfig()) ?? next();
});

// A native tracker has no browser Origin/session. Only this exact endpoint uses
// its own device credentials; all other paths retain the browser access gates.
const ownTracks = createMiddleware().server(async ({ request, next }) => {
  if (new URL(request.url).pathname !== "/api/collect/owntracks") return next();
  const { handleOwnTracksRequest } = await import("./features/telemetry/owntracks/http.server");
  return handleOwnTracksRequest(request);
});

// The collector authenticates only this exact path with its dedicated token.
const xiaomiScale = createMiddleware().server(async ({ request, next }) => {
  if (new URL(request.url).pathname !== "/api/collect/xiaomi-scale") return next();
  const { handleXiaomiScaleRequest } =
    await import("./features/telemetry/xiaomi-scale/http.server");
  return handleXiaomiScaleRequest(request);
});

const csrf = createCsrfMiddleware({
  filter: (context) => context.handlerType === "serverFn",
});

const appSession = createMiddleware().server(async ({ request, next }) => {
  const { checkSessionAccess } = await import("./features/auth/gate.server");
  const { setResponseHeader } = await import("@tanstack/react-start/server");
  setResponseHeader("Cache-Control", "no-store");
  return checkSessionAccess(request) ?? next();
});

const storage = createMiddleware().server(async ({ next }) => {
  const { getDatabase } = await import("./features/storage/database.server");
  getDatabase();
  return next();
});

export const startInstance = createStart(() => ({
  requestMiddleware: [health, mcp, ownTracks, xiaomiScale, ownerAccess, csrf, storage, appSession],
}));
