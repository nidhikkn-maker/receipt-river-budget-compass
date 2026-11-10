import { createFileRoute } from "@tanstack/react-router";
import { SignatureAdd } from "@/components/shell/pages/UtilityPages";

// Signature Flow shell route (§5.2, batch B1 — proposed). Renders inside whichever shell is active.
export const Route = createFileRoute("/_authenticated/add")({
  head: () => ({ meta: [
    { title: "Add — Thapal" },
    { name: "description", content: "Smart Add: receipts, statements, bookings and documents." },
    { property: "og:title", content: "Add — Thapal" },
    { property: "og:description", content: "Smart Add: receipts, statements, bookings and documents." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: SignatureAdd,
});
