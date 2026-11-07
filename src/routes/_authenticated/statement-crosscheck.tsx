import { createFileRoute, redirect } from "@tanstack/react-router";

// Statement Desk is the single upload and matching place for bank statements.
export const Route = createFileRoute("/_authenticated/statement-crosscheck")({
  beforeLoad: () => { throw redirect({ to: "/statements", replace: true }); },
  head: () => ({ meta: [
    { title: "Statement Desk — Ledgerline" },
    { name: "description", content: "Bank statements are uploaded and matched in Statement Desk." },
    { property: "og:title", content: "Statement Desk — Ledgerline" },
    { property: "og:description", content: "Upload and match every bank statement in one place." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});
