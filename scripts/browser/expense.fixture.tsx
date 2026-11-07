import { createRoot } from "react-dom/client";
import { createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { Route as NewRoute } from "../../src/routes/_authenticated/new";
import { Route as ExpensesRoute } from "../../src/routes/_authenticated/expenses";
import { StoreFixture } from "./expense-mocks.tsx";
import { Toaster } from "../../src/components/ui/sonner";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import "../../src/styles.css";

const queryClient = new QueryClient({ defaultOptions:{queries:{retry:false}} });
queryClient.setQueryData(['team-access','controlled-owner'],{role:null,admin:false,switches:[]});
const rootRoute = createRootRoute({ component: () => <QueryClientProvider client={queryClient}><StoreFixture><Outlet /><Toaster duration={60000} /></StoreFixture></QueryClientProvider> });
const authenticated = createRoute({ getParentRoute: () => rootRoute, id: "_authenticated", component: () => <main className="px-4 sm:px-8"><Outlet /></main> });
const entry = NewRoute.update({ id: "/new", path: "/new", getParentRoute: () => authenticated });
const expenses = ExpensesRoute.update({ id: "/expenses", path: "/expenses", getParentRoute: () => authenticated });
const dashboard = createRoute({ getParentRoute: () => authenticated, path: "/dashboard", component: () => <h1>Controlled save complete</h1> });
const router = createRouter({ routeTree: rootRoute.addChildren([authenticated.addChildren([entry, expenses, dashboard])]) });
const root = document.getElementById("root");
if (root) createRoot(root).render(<RouterProvider router={router} />);