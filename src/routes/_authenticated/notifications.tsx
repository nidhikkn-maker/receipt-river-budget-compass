import { createFileRoute } from "@tanstack/react-router";
import { SignatureNotifications } from "@/components/shell/pages/UtilityPages";

// Signature Flow shell route (§5.2, batch B1 — proposed). Renders inside whichever shell is active.
export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [
    { title: "Notifications — Thapal" },
    { name: "description", content: "Alerts worked out from your payments, cards and balances." },
    { property: "og:title", content: "Notifications — Thapal" },
    { property: "og:description", content: "Alerts worked out from your payments, cards and balances." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: SignatureNotifications,
});
