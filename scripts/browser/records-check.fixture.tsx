import React from "react";
import { createRoot } from "react-dom/client";
import { createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { Route as RecordsCheckRoute } from "../../src/routes/_authenticated/records-check";
import { Toaster } from "../../src/components/ui/sonner";
import "../../src/styles.css";

// Render the real route component and real controls, with only its data layer replaced.
const RecordsCheck = RecordsCheckRoute.options.component;
const rootRoute = createRootRoute({
  component: () => <main>{RecordsCheck && <RecordsCheck />}<Toaster duration={60000} /></main>,
});
const router = createRouter({ routeTree: rootRoute, defaultNotFoundComponent: rootRoute.options.component });
const root = document.getElementById("root");
if (root) createRoot(root).render(<RouterProvider router={router} />);