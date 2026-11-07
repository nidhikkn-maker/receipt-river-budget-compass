import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Ledgerline — Personal finance" },
      { name: "description", content: "Accounts, family spending, budgets and cash-flow planning." },
      { property: "og:title", content: "Ledgerline — Personal finance" },
      { property: "og:description", content: "Accounts, family spending, budgets and cash-flow planning." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
