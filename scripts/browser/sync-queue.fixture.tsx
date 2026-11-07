import { createRoot } from "react-dom/client";
import { createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { Route as SyncQueueRoute } from "../../src/routes/_authenticated/sync-queue";
import { StoreFixture } from "./sync-queue-mocks.tsx";
import "../../src/styles.css";

const rootRoute = createRootRoute({ component: () => <StoreFixture><Outlet /></StoreFixture> });
const authenticated = createRoute({ getParentRoute: () => rootRoute, id: "_authenticated", component: Outlet });
const syncQueue = SyncQueueRoute.update({ id: "/sync-queue", path: "/sync-queue", getParentRoute: () => authenticated });
const router = createRouter({ routeTree: rootRoute.addChildren([authenticated.addChildren([syncQueue])]) });
const root = document.getElementById("root");
if (root) createRoot(root).render(<RouterProvider router={router} />);
