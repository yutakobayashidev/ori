import { createFileRoute } from "@tanstack/react-router";

async function handle({ request }: { request: Request }) {
  const { authEndpoint } = await import("../../features/auth/http.server");
  return authEndpoint(request);
}

export const Route = createFileRoute("/api/auth")({
  server: { handlers: { GET: handle, POST: handle } },
});
