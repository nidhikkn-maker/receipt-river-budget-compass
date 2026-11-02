import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Start fetching a page's code on touch/hover so it's ready when the tap lands.
    defaultPreload: "intent",
    defaultPreloadDelay: 0,
    defaultPendingMs: 150,
    defaultPendingMinMs: 200,
  });

  return router;
};
