import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/execution/events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const [{ executionEvents }, { getSession }, { sessionToken }] = await Promise.all([
          import("../../../features/execution/http.server"),
          import("../../../features/auth/auth.server"),
          import("../../../features/auth/http.server"),
        ]);
        const token = sessionToken(request);
        return executionEvents(request, () => Boolean(getSession(token)?.onboardingCompletedAt));
      },
    },
  },
});
