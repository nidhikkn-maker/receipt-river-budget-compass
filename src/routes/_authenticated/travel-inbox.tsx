import { createFileRoute } from "@tanstack/react-router";
import { PageTitle } from "@/components/AppShell";
import { TravelInbox } from "@/components/trip/TravelInbox";
export const Route = createFileRoute("/_authenticated/travel-inbox")({
  head: () => ({ meta: [{ title: "Travel inbox — Ledgerline" }, { name: "description", content: "Review booking confirmations, saved trip messages and suggested expense links." }, { property: "og:title", content: "Travel inbox — Ledgerline" }, { property: "og:description", content: "Booking confirmations, travel messages and expense suggestions awaiting review." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => <><PageTitle title="Travel inbox" /><TravelInbox /></>,
});