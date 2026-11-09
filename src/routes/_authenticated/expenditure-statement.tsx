import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ExpenditureReportBuilder } from "@/components/ExpenditureReportBuilder";

export const Route = createFileRoute("/_authenticated/expenditure-statement")({
  validateSearch: z.object({ trip: z.string().optional(), tag: z.string().optional(), entry: z.string().optional(), entries: z.string().max(18500).optional() }),
  head: () => ({ meta: [
    { title: "Detailed Expenditure Statement — Thapal" },
    { name: "description", content: "A complete A4 expenditure statement for a trip, event, project or purchase, with original bills attached." },
    { property: "og:title", content: "Detailed Expenditure Statement — Thapal" },
    { property: "og:description", content: "A complete A4 expenditure statement for a trip, event, project or purchase, with original bills attached." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: StatementPage,
});

function StatementPage() {
  return <ExpenditureReportBuilder mode="statement" search={Route.useSearch()} />;
}
