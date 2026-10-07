import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/activities/events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const [{ activityEvents }, { subscribeActivities }, { getSession }, { sessionToken }] =
          await Promise.all([
            import("../../../features/activities/http-events.server"),
            import("../../../features/activities/events.server"),
            import("../../../features/auth/auth.server"),
            import("../../../features/auth/http.server"),
          ]);
        const token = sessionToken(request);
        return activityEvents(request, subscribeActivities, () =>
          Boolean(getSession(token)?.onboardingCompletedAt),
        );
      },
    },
  },
});
