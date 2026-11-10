import { createFileRoute } from "@tanstack/react-router";
import { NotificationCentre } from "@/components/NotificationCentre";
import { SignatureNotifications } from "@/components/shell/pages/UtilityPages";
import { useShellMode } from "@/components/shell/use-shell-mode";

// Notifications: the Signature Flow shell page when that (proposed) shell is active; otherwise the classic
// Notification centre (B05). Development base only — the shell is not activated without KK's approval.
function NotificationsRoute() {
  const { mode } = useShellMode();
  return mode === "signature-flow" ? <SignatureNotifications /> : <NotificationCentre />;
}

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [
    { title: "Notifications — Thapal" },
    { name: "description", content: "Reminders from your records, grouped, with read and unread and a direct link to each record." },
    { property: "og:title", content: "Notifications — Thapal" }, { property: "og:description", content: "Grouped reminders with a direct link to each record." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: NotificationsRoute,
});
