import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/execution/artifacts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const [{ executionArtifact }, { getSession }, { sessionToken }] = await Promise.all([
          import("../../../features/execution/http.server"),
          import("../../../features/auth/auth.server"),
          import("../../../features/auth/http.server"),
        ]);
        const token = sessionToken(request);
        return executionArtifact(request, () => Boolean(getSession(token)?.onboardingCompletedAt));
      },
    },
  },
});
