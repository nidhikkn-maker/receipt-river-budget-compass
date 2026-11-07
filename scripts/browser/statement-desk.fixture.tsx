import React from "react";
import { createRoot } from "react-dom/client";
import { createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { Route as DeskRoute } from "../../src/routes/_authenticated/statements";
import { SmartAdd } from "../../src/components/SmartAdd";
import { Toaster } from "../../src/components/ui/sonner";
import "../../src/styles.css";

// Render the real route component and real controls, with only its data layer replaced.
const Desk = DeskRoute.options.component;
const rootRoute = createRootRoute({
  component: () => <main>{location.pathname === "/smart" ? <SmartAdd open onOpenChange={() => {}} /> : Desk && <Desk />}<Toaster duration={60000} /></main>,
});
const router = createRouter({ routeTree: rootRoute, defaultNotFoundComponent: rootRoute.options.component });
const root = document.getElementById("root");
if (root) createRoot(root).render(<RouterProvider router={router} />);