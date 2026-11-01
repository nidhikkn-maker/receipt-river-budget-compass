import { createRoot } from "react-dom/client";
import { createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { Route as NewRoute } from "../../src/routes/_authenticated/new";
import { Route as ExpensesRoute } from "../../src/routes/_authenticated/expenses";
import { StoreFixture } from "./expense-mocks.tsx";
import { Toaster } from "../../src/components/ui/sonner";
import "../../src/styles.css";

const rootRoute = createRootRoute({ component: () => <StoreFixture><Outlet /><Toaster duration={60000} /></StoreFixture> });
const authenticated = createRoute({ getParentRoute: () => rootRoute, id: "_authenticated", component: Outlet });
const entry = NewRoute.update({ id: "/new", path: "/new", getParentRoute: () => authenticated });
const expenses = ExpensesRoute.update({ id: "/expenses", path: "/expenses", getParentRoute: () => authenticated });
const dashboard = createRoute({ getParentRoute: () => authenticated, path: "/dashboard", component: () => <h1>Controlled save complete</h1> });
const router = createRouter({ routeTree: rootRoute.addChildren([authenticated.addChildren([entry, expenses, dashboard])]) });
const root = document.getElementById("root");
if (root) createRoot(root).render(<RouterProvider router={router} />);