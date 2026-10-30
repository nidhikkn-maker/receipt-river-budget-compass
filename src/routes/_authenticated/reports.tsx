import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { applyFilters } from "@/lib/expenses";
import { buildReport, downloadBlob, toCsv, toPdf, type ReportKind } from "@/lib/reports";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Ledgerline" },
      { name: "description", content: "Download business, personal and category reports as CSV or PDF." },
      { property: "og:title", content: "Reports — Ledgerline" },
      { property: "og:description", content: "Download business, personal and category reports as CSV or PDF." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Reports,
});

const KINDS: { kind: ReportKind; title: string; desc: string }[] = [
  { kind: "business", title: "Business expenses", desc: "Only business-tagged spend — ready to claim or hand to your accountant." },
  { kind: "expenses", title: "All expenses", desc: "Everything, with type, family member, payment method and currency conversion." },
  { kind: "categories", title: "By category", desc: "Business vs personal totals per category, with monthly budgets." },
];

function Reports() {
  const { expenses, memberName, members, budgets } = useStore();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [member, setMember] = useState("all");
  const list = applyFilters(expenses, { from, to, memberId: member });
  const stamp = new Date().toISOString().slice(0, 10);
  const subtitle = `${member === "all" ? "Everyone" : memberName(member === "me" ? null : member)} · ${from || "start"} to ${to || "today"} · amounts in INR · generated ${stamp}`;

  const csv = (k: ReportKind) => downloadBlob(new Blob([toCsv(buildReport(k, list, memberName, budgets))], { type: "text/csv;charset=utf-8" }), `ledgerline-${k}-${stamp}.csv`);
  const pdf = async (k: ReportKind) => {
    try { downloadBlob(await toPdf(buildReport(k, list, memberName, budgets), subtitle), `ledgerline-${k}-${stamp}.pdf`); } catch { toast.error("Couldn't create the PDF"); }
  };

  return (
    <>
      <PageTitle eyebrow="Reports" title="Export" sub="CSV for spreadsheets, PDF for sharing." />
      <div className="mb-6 grid gap-3 rounded-3xl border bg-card p-5 sm:grid-cols-4 sm:items-end">
        <div className="grid gap-1"><Label htmlFor="from">From</Label><Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="grid gap-1"><Label htmlFor="to">To</Label><Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div className="grid gap-1">
          <Label>For</Label>
          <Select value={member} onValueChange={setMember}>
            <SelectTrigger aria-label="Family member"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              <SelectItem value="me">Me</SelectItem>
              {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-muted-foreground">{list.length} expense{list.length === 1 ? "" : "s"} in range</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {KINDS.map((k) => (
          <div key={k.kind} className="flex flex-col rounded-3xl border bg-card p-5">
            <h2 className="font-display text-xl font-bold">{k.title}</h2>
            <p className="mt-1 flex-1 text-sm text-muted-foreground">{k.desc}</p>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" size="sm" onClick={() => csv(k.kind)}>CSV</Button>
              <Button size="sm" onClick={() => void pdf(k.kind)}>PDF</Button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
