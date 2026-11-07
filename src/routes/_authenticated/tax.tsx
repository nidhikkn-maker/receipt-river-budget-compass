import { AccountingDetails } from "@/components/AccountingDetails";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageTitle } from "@/components/AppShell";
import { useStore } from "@/lib/store";
import { fyOf, yearsSince } from "@/lib/entities";
import { taxDraft } from "@/lib/tax-summary";
import { gstMonths } from "@/lib/receivables";
import { estimateTax, rulesFor } from "@/lib/tax-rules";
import { FilingCalendar, FyOnboarding, GstReturns, RulesRegister, TaxComputationCard, TaxProfiles } from "@/components/books/TaxCentre";
import { TeamCompanyTax } from "@/components/TeamAccess";

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
  const gm = useMemo(() => { const start = Number(fy.slice(0, 4)); const ms = Array.from({ length: 12 }, (_, i) => { const d = new Date(start, 3 + i, 15); return d.toISOString().slice(0, 7); }).filter((m) => m <= today.slice(0, 7)); return gstMonths(preferences.receivables ?? [], transactions, ms).reverse(); }, [fy, transactions, preferences.receivables, today]);
  const rows: [string, number][] = [["Income received", d.income], ["Business spending", d.businessSpend], ["Tax depreciation (your share)", d.depreciation], ["Working profit", d.workingProfit], ["GST paid on business bills", d.gstInput]];

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <PageTitle title="Tax & audit" sub="Working drafts from your records — never filed by Ledgerline. Your accountant files with your approval." />
      <p className="mb-3 text-sm text-muted-foreground">In everyday terms: this shows how much tax your records suggest, what GST you paid that may be claimed back, and which documents your accountant will need. Official form names and tax heads are kept exactly as the law uses them, so your accountant sees the correct terms.</p>
      <AccountingDetails terms={['inputCredit','depreciation','accrual','payable','receivable']} />
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
      <div className="rounded-2xl border bg-card text-sm">
        <p className="px-4 pt-3 font-semibold">GST by month (GSTR-3B working)</p>
        <table className="w-full text-xs"><thead><tr className="text-muted-foreground"><th className="px-4 py-2 text-left">Month</th><th className="text-right">On your invoices</th><th className="text-right">On your bills</th><th className="px-4 text-right">Net</th></tr></thead>
          <tbody>{gm.map((g) => <tr key={g.month} className="border-t"><td className="px-4 py-2">{g.month}</td><td className="text-right">{inr(g.outputGst)}</td><td className="text-right">{inr(g.inputGst)}</td><td className="px-4 text-right font-semibold">{g.net >= 0 ? inr(g.net) : `${inr(-g.net)} credit`}</td></tr>)}</tbody>
        </table>
        <p className="px-4 pb-3 text-xs text-muted-foreground">Invoice GST comes from Customers owing; bill GST is what's printed on business bills. Not a filed return.</p>
      </div>
      {d.billsMissing > 0 && <p className="text-sm">{d.billsMissing} business spends this year have no bill. <Link to="/gst-check" className="font-semibold text-primary underline">See them</Link></p>}
      <TaxComputationCard fy={fy} />
      <TeamCompanyTax />
      <FilingCalendar fy={fy} />
      <TaxProfiles fy={fy} />
      <GstReturns fy={fy} />
      <FyOnboarding />
      <RulesRegister />
      <Link to="/statements" search={{ context: "tax" }} className="block text-sm font-semibold text-primary underline">Upload salary, rent, investment or tax documents</Link>
      <p className="text-xs text-muted-foreground">GST input only counts tax printed on bills you attached; claimable credit depends on supplier filings (GSTR-2B), which aren't connected.</p>
    </div>
  );
}
