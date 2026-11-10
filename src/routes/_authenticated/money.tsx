import { createFileRoute } from "@tanstack/react-router";
import { SignatureMoney } from "@/components/shell/pages/MoneyPage";

// Signature Flow shell route (§5.2, batch B1 — proposed). Renders inside whichever shell is active.
export const Route = createFileRoute("/_authenticated/money")({
  head: () => ({ meta: [
    { title: "Money — Thapal" },
    { name: "description", content: "Accounts, cards, investments, assets and trips, starting from the account." },
    { property: "og:title", content: "Money — Thapal" },
    { property: "og:description", content: "Accounts, cards, investments, assets and trips, starting from the account." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: SignatureMoney,
});
