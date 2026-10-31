import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ExpenditureReportBuilder } from "@/components/ExpenditureReportBuilder";

export const Route = createFileRoute("/_authenticated/claim-submission")({
  validateSearch: z.object({ trip: z.string().optional(), tag: z.string().optional(), entry: z.string().optional() }),
  head: () => ({ meta: [
    { title: "Expense Claim Submission — Ledgerline" },
    { name: "description", content: "A formal reimbursement claim for your organisation with itemised expenses, declaration, approval fields and original bills." },
    { property: "og:title", content: "Expense Claim Submission — Ledgerline" },
    { property: "og:description", content: "A formal reimbursement claim for your organisation with itemised expenses, declaration, approval fields and original bills." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ClaimPage,
});

function ClaimPage() {
  return <ExpenditureReportBuilder mode="claim" search={Route.useSearch()} />;
}
