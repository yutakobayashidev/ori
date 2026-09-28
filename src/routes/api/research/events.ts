import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/research/events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const [{ researchEvents }, { researchService }] = await Promise.all([
          import("../../../features/research/events.server"),
          import("../../../features/research/runner.server"),
        ]);
        const { getSession } = await import("../../../features/auth/auth.server");
        const { sessionToken } = await import("../../../features/auth/http.server");
        const token = sessionToken(request);
        return researchEvents(
          request,
          (listener, id) => researchService().subscribe(listener, id),
          () => Boolean(getSession(token)?.onboardingCompletedAt),
        );
      },
    },
  },
});
