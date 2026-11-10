import { createFileRoute } from "@tanstack/react-router";
import { SignatureHome } from "@/components/shell/pages/HomePage";

// Signature Flow shell route (§5.2, batch B1 — proposed). Renders inside whichever shell is active.
export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({ meta: [
    { title: "Home — Thapal" },
    { name: "description", content: "Your money, plans and what needs you, at a glance." },
    { property: "og:title", content: "Home — Thapal" },
    { property: "og:description", content: "Your money, plans and what needs you, at a glance." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: SignatureHome,
});
