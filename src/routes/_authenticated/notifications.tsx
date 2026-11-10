import { createFileRoute } from "@tanstack/react-router";
import { NotificationCentre } from "@/components/NotificationCentre";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [
    { title: "Notifications — Thapal" },
    { name: "description", content: "Reminders from your records, grouped, with read and unread and a direct link to each record." },
    { property: "og:title", content: "Notifications — Thapal" }, { property: "og:description", content: "Grouped reminders with a direct link to each record." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: NotificationCentre,
});
