import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/reconcile")({
  beforeLoad: ({ location }) => { throw redirect({ to: "/inbox", search: { section: "statements" }, hash: location.hash, replace: true }); },
  head: () => ({ meta: [
    { title: "Statements in Financial Inbox — Ledgerline" },
    { name: "description", content: "Statement uploads and matching now live in Financial Inbox." },
    { property: "og:title", content: "Statements in Financial Inbox — Ledgerline" },
    { property: "og:description", content: "Review statement uploads and matched transactions in Financial Inbox." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});