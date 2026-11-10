import { createFileRoute } from "@tanstack/react-router";
import { SignatureTasks } from "@/components/shell/pages/TasksPage";

// Signature Flow shell route (§5.2, batch B1 — proposed). Renders inside whichever shell is active.
export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({ meta: [
    { title: "To-do — Thapal" },
    { name: "description", content: "What needs your review, from statements, receipts and reminders." },
    { property: "og:title", content: "To-do — Thapal" },
    { property: "og:description", content: "What needs your review, from statements, receipts and reminders." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: SignatureTasks,
});
