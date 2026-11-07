import React from 'react';
import { createRoot } from 'react-dom/client';
import { createRootRoute, createRoute, createRouter, RouterProvider, Outlet } from '@tanstack/react-router';
import '/src/styles.css';
import { ExpenditureReportBuilder } from '/src/components/ExpenditureReportBuilder.tsx';
const root = createRootRoute({ component: Outlet });
const index = createRoute({ getParentRoute: () => root, path: '/', component: () => {
  const claim = new URLSearchParams(window.location.search).get('mode') === 'claim';
  return <main className="mx-auto max-w-4xl p-4"><ExpenditureReportBuilder mode={claim ? 'claim' : 'statement'} search={claim ? { entries: 'e,missing,broken' } : { entry: 'e' }} /></main>;
} });
const router = createRouter({ routeTree: root.addChildren([index]) });
const mount = document.getElementById('root');
if (mount) createRoot(mount).render(<RouterProvider router={router} />);