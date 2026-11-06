import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { oidcLogin } = await import("../../../features/auth/oidc.server");
        return oidcLogin(request);
      },
    },
  },
});
