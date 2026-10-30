import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEPARTMENTS } from "@/lib/expenses";
import { buildReport, downloadBlob, toCsv, toPdf, type ReportKind } from "@/lib/reports";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Ledgerline" },
      { name: "description", content: "Download expense, reimbursement and department spending reports as CSV or PDF." },
      { property: "og:title", content: "Reports — Ledgerline" },
      { property: "og:description", content: "Download expense, reimbursement and department spending reports as CSV or PDF." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Reports,
});

const KINDS: { kind: ReportKind; title: string; desc: string; reviewerOnly?: boolean }[] = [
  { kind: "expenses", title: "Expenses", desc: "Every expense with employee, merchant, category, status and amount." },
  { kind: "reimbursements", title: "Reimbursements", desc: "Approved and paid expenses, with payment date and who paid." },
  { kind: "departments", title: "Department spending", desc: "Budget, approved, pending and remaining per department.", reviewerOnly: true },
];

function Reports() {
  const { user, expenses, people, budgets } = useStore();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const inRange = expenses.filter((e) => (!from || e.date >= from) && (!to || e.date <= to));
  const depts = user.role === "manager" ? [user.department] : DEPARTMENTS;
  const scope = user.role === "employee" ? "your expenses" : user.role === "manager" ? `${user.department} department` : "all departments";
  const stamp = new Date().toISOString().slice(0, 10);
  const subtitle = `${scope} · ${from || "start"} to ${to || "today"} · generated ${stamp}`;

  const csv = (k: ReportKind) => {
    const r = buildReport(k, inRange, people, budgets, depts);
    downloadBlob(new Blob([toCsv(r)], { type: "text/csv;charset=utf-8" }), `ledgerline-${k}-${stamp}.csv`);
  };
  const pdf = async (k: ReportKind) => {
    try {
      const r = buildReport(k, inRange, people, budgets, depts);
      downloadBlob(await toPdf(r, subtitle), `ledgerline-${k}-${stamp}.pdf`);
    } catch {
      toast.error("Couldn't create the PDF");
    }
  };

  return (
    <>
      <PageTitle title="Reports" sub={`Download reports for ${scope}.`} />
      <div className="mb-6 flex flex-wrap items-end gap-4 rounded-2xl border bg-card p-4">
        <div className="grid gap-1"><Label htmlFor="from">From</Label><Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="grid gap-1"><Label htmlFor="to">To</Label><Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <p className="text-sm text-muted-foreground">{inRange.length} expense{inRange.length === 1 ? "" : "s"} in range</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {KINDS.filter((k) => !k.reviewerOnly || user.role !== "employee").map((k) => (
          <div key={k.kind} className="flex flex-col rounded-2xl border bg-card p-5">
            <h2 className="font-display text-xl">{k.title}</h2>
            <p className="mt-1 flex-1 text-sm text-muted-foreground">{k.desc}</p>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" size="sm" onClick={() => csv(k.kind)}>Download CSV</Button>
              <Button size="sm" onClick={() => void pdf(k.kind)}>Download PDF</Button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
