import { createFileRoute } from "@tanstack/react-router";
import { SignatureCalendar } from "@/components/shell/pages/UtilityPages";

// Signature Flow shell route (§5.2, batch B1 — proposed). Renders inside whichever shell is active.
export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({ meta: [
    { title: "Calendar — Thapal" },
    { name: "description", content: "Due dates, EMIs, expected income and document dates by month." },
    { property: "og:title", content: "Calendar — Thapal" },
    { property: "og:description", content: "Due dates, EMIs, expected income and document dates by month." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: SignatureCalendar,
});
