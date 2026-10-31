import { createFileRoute } from "@tanstack/react-router";
import { PageTitle } from "@/components/AppShell";
import { PaymentMethodsManager } from "@/components/PaymentMethodsManager";

export const Route = createFileRoute("/_authenticated/payment-methods")({
  head: () => ({
    meta: [
      { title: "Payment methods — Ledgerline" },
      { name: "description", content: "Save your UPI IDs, debit and credit cards, wallets and cash, each linked to its bank account." },
      { property: "og:title", content: "Payment methods — Ledgerline" },
      { property: "og:description", content: "Save your UPI IDs, debit and credit cards, wallets and cash, each linked to its bank account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <div className="mx-auto max-w-3xl">
      <PageTitle title="Payment methods" subtitle="Your UPI IDs, cards, wallets and cash. Each one is linked to the account its money comes from." />
      <div className="rounded-3xl border bg-card p-5"><PaymentMethodsManager /></div>
    </div>
  ),
});
