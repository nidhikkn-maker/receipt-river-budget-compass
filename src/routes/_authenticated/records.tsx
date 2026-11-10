import { createFileRoute } from "@tanstack/react-router";
import { SignatureRecords } from "@/components/shell/pages/RecordsPage";

// Signature Flow shell route (§5.2, batch B1 — proposed). Renders inside whichever shell is active.
export const Route = createFileRoute("/_authenticated/records")({
  head: () => ({ meta: [
    { title: "Records — Thapal" },
    { name: "description", content: "Documents, travel, assets, property, investments and reimbursements." },
    { property: "og:title", content: "Records — Thapal" },
    { property: "og:description", content: "Documents, travel, assets, property, investments and reimbursements." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: SignatureRecords,
});
