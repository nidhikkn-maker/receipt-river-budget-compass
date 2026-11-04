import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageTitle } from "@/components/AppShell";
import { useStore } from "@/lib/store";
import { fyOf, yearsSince } from "@/lib/entities";
import { taxDraft } from "@/lib/tax-summary";
import { estimateTax, rulesFor } from "@/lib/tax-rules";

export const Route = createFileRoute("/_authenticated/tax")({
  head: () => ({ meta: [
    { title: "Income tax & GST working — Ledgerline" },
    { name: "description", content: "Draft yearly income, business spending, GST input on bills and depreciation to share with your accountant." },
    { property: "og:title", content: "Income tax & GST working — Ledgerline" },
    { property: "og:description", content: "Draft yearly income, business spending, GST input on bills and depreciation to share with your accountant." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Tax,
});

const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

function Tax() {
  const { transactions, preferences } = useStore();
  const today = new Date().toISOString().slice(0, 10);
  const years = yearsSince("2024-25", today).reverse();
  const [fy, setFy] = useState(fyOf(today));
  const d = useMemo(() => taxDraft(fy, transactions, preferences.assets ?? []), [fy, transactions, preferences.assets]);
  const { rules, carriedForward } = rulesFor(fy);
  const est = estimateTax(d.workingProfit, rules);
  const rows: [string, number][] = [["Income received", d.income], ["Business spending", d.businessSpend], ["Tax depreciation (your share)", d.depreciation], ["Working profit", d.workingProfit], ["GST paid on business bills", d.gstInput]];

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <PageTitle title="Income tax & GST" sub="A working draft from your records — not a return. Your accountant files." />
      <div className="flex flex-wrap gap-2">
        {years.map((y) => <button key={y} type="button" onClick={() => setFy(y)} className={`rounded-full border px-3 py-1 text-sm ${y === fy ? "bg-primary text-primary-foreground" : "bg-card"}`}>FY {y}</button>)}
      </div>
      <div className="divide-y rounded-2xl border bg-card">
        {rows.map(([k, v]) => <div key={k} className="flex justify-between px-4 py-3 text-sm"><span>{k}</span><b>{inr(v)}</b></div>)}
      </div>
      <div className="rounded-2xl border bg-card p-4 text-sm">
        <div className="flex justify-between"><span>Estimated tax on working profit</span><b>{inr(est)}</b></div>
        <p className="mt-1 text-xs text-muted-foreground">Rules: {rules.source}{carriedForward ? ` — FY ${fy} rules not added yet, using FY ${rules.fy}` : ""}. Includes 4% cess; excludes surcharge, deductions and advance tax paid.</p>
      </div>
      {d.billsMissing > 0 && <p className="text-sm">{d.billsMissing} business spends this year have no bill. <Link to="/gst-check" className="font-semibold text-primary underline">See them</Link></p>}
      <p className="text-xs text-muted-foreground">GST input only counts tax printed on bills you attached; claimable credit depends on supplier filings (GSTR-2B), which aren't connected.</p>
    </div>
  );
}
