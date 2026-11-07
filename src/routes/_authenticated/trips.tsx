import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout for /trips and /trips/$tripId — the overview lives in trips.index.tsx.
export const Route = createFileRoute("/_authenticated/trips")({
  component: () => <Outlet />,
});
