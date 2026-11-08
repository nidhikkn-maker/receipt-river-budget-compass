import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { Route as DeskRoute } from "../../src/routes/_authenticated/statements";
import { SmartAdd } from "../../src/components/SmartAdd";
import { Route as ReportsRoute } from '../../src/routes/_authenticated/reports';
import { Button } from '../../src/components/ui/button';
import { Toaster } from "../../src/components/ui/sonner";
import "../../src/styles.css";

// Render the real route component and real controls, with only its data layer replaced.
const Desk = DeskRoute.options.component;
const Reports = ReportsRoute.options.component;
function Journey() {
  const [reports, setReports] = useState(false);
  return <main><Button onClick={() => setReports(v => !v)}>{reports ? 'Back to statement' : 'Reports for saved statement'}</Button>{reports ? Reports && <Reports /> : location.pathname === '/smart' ? <SmartAdd open onOpenChange={() => {}} /> : Desk && <Desk />}<Toaster duration={60000} /></main>;
}
const rootRoute = createRootRoute({
  component: Journey,
});
const statementRoute = createRoute({ getParentRoute: () => rootRoute, path: '/statements', component: () => null });
const smartRoute = createRoute({ getParentRoute: () => rootRoute, path: '/smart', component: () => null });
const router = createRouter({ routeTree: rootRoute.addChildren([statementRoute, smartRoute]), defaultNotFoundComponent: () => null });
const root = document.getElementById("root");
const mounted = window as Window & { controlledDeskMounted?: boolean };
if (root && !mounted.controlledDeskMounted) { mounted.controlledDeskMounted = true; createRoot(root).render(<RouterProvider router={router} />); }