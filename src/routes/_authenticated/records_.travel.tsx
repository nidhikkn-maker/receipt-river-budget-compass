import { createFileRoute, redirect } from "@tanstack/react-router";

// Travel sits under Records (KK decision 7). Its pages keep their own addresses (/trips, /trips/<id>), so every old
// link and deep link still works; this Records-scoped address simply leads there, keeping the trip filters.
export const Route = createFileRoute("/_authenticated/records_/travel")({
  validateSearch: (search: Record<string, unknown>): { trip?: string; status?: "upcoming" } => ({ ...(typeof search["trip"] === "string" ? { trip: search["trip"] } : {}), ...(search["status"] === "upcoming" ? { status: "upcoming" as const } : {}) }),
  beforeLoad: ({ search, location }) => { throw redirect({ to: "/trips", search, hash: location.hash, replace: true }); },
  head: () => ({ meta: [
    { title: "Travel · Records — Thapal" },
    { name: "description", content: "Travel lives under Records: trips, bookings, receipts and claims." },
    { property: "og:title", content: "Travel · Records — Thapal" },
    { property: "og:description", content: "Trips, bookings, receipts and claims under Records." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});
