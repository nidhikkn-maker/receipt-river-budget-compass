import { createRoot } from "react-dom/client";
import { createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { Route as UploadRequestsRoute } from "../../src/routes/_authenticated/upload-requests";
import { PageTitle } from "./upload-requests-mocks.tsx";
import "../../src/styles.css";

void PageTitle;

const rootRoute = createRootRoute({ component: () => <Outlet /> });
const authenticated = createRoute({ getParentRoute: () => rootRoute, id: "_authenticated", component: Outlet });
const uploadRequests = UploadRequestsRoute.update({ id: "/upload-requests", path: "/upload-requests", getParentRoute: () => authenticated });
const settings = createRoute({ getParentRoute: () => authenticated, path: "/settings", component: () => <div>Settings</div> });
const router = createRouter({ routeTree: rootRoute.addChildren([authenticated.addChildren([uploadRequests, settings])]) });
const root = document.getElementById("root");
if (root) createRoot(root).render(<RouterProvider router={router} />);
