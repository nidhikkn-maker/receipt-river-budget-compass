import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Ledgerline — Team Expenses" },
      { name: "description", content: "Expense submissions, approvals and budgets for teams." },
      { property: "og:title", content: "Ledgerline — Team Expenses" },
      { property: "og:description", content: "Expense submissions, approvals and budgets for teams." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
