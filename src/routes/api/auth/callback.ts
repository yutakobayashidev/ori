import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { oidcCallback } = await import("../../../features/auth/oidc.server");
        return oidcCallback(request);
      },
    },
  },
});
