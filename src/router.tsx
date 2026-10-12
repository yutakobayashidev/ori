import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { routeTree } from "./routeTree.gen";
import { parseWorkspaceSearch, stringifyWorkspaceSearch } from "./features/navigation/search-codec";

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
    },
  });
  // Temporary decks belong to this browser session, including visits to Browse.
  queryClient.setQueryDefaults(["deck-workspace"], { gcTime: Infinity });
  const router = createRouter({
    routeTree,
    parseSearch: parseWorkspaceSearch,
    stringifySearch: stringifyWorkspaceSearch,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: false,
  });

  setupRouterSsrQueryIntegration({ router, queryClient });
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
