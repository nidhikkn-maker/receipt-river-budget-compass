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
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import { money, totalsBy } from "@/lib/expenses";
import { ExpenseTable } from "@/components/ExpenseTable";
import { monthlySeries, weeklySpend, netWorthSeries, spendBy, monthToDateCompare } from "@/lib/insights";
import { PAYMENT_METHODS, PAYMENT_LABEL, type Scope } from "@/lib/expenses";

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
  { kind: "reimbursements", title: "Reimbursements", desc: "Pending and received claims." },
];

function Reports() {
  const { transactions, accounts, valuations, memberName, members, budgets } = useStore();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [member, setMember] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [scope,setScope]=useState<Scope|"all">("all");const [account,setAccount]=useState("all");const [payment,setPayment]=useState("all");const [query,setQuery]=useState("");
  const filtered = applyFilters(transactions, { from, to, memberId: member, scope, accountId:account, paymentMethod:payment, query });
  const list=filtered.filter(e=>(e.txnType??"expense")==="expense");
  const categoryRows = Object.entries(totalsBy(list,e=>e.category)).map(([name,amount])=>({name,amount}));
  const stamp = new Date().toISOString().slice(0, 10);
  const monthly=monthlySeries(filtered,stamp,12);const weekly=weeklySpend(filtered,stamp,8);const worth=netWorthSeries(accounts,transactions,valuations,stamp,12).map(x=>({...x,netWorth:x.net}));const cmp=monthToDateCompare(filtered,stamp);
  const merchants=spendBy(list,e=>e.merchant||e.title,10);const byAccount=spendBy(list,e=>accounts.find(a=>a.id===e.accountId)?.name??"Unassigned",10);
  const subtitle = `${member === "all" ? "Everyone" : memberName(member === "me" ? null : member)} · ${from || "start"} to ${to || "today"} · amounts in INR · generated ${stamp}`;

  const csv = (k: ReportKind) => downloadBlob(new Blob([toCsv(buildReport(k, list, memberName, budgets))], { type: "text/csv;charset=utf-8" }), `ledgerline-${k}-${stamp}.csv`);
  const pdf = async (k: ReportKind) => {
    try { downloadBlob(await toPdf(buildReport(k, list, memberName, budgets), subtitle), `ledgerline-${k}-${stamp}.pdf`); } catch { toast.error("Couldn't create the PDF"); }
  };

  return (
    <>
      <PageTitle eyebrow="Insights" title="Spending & reports" />
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
      <div className="mb-6 grid gap-3 sm:grid-cols-4"><Select value={scope} onValueChange={v=>setScope(v as Scope|"all")}><SelectTrigger aria-label="Insight scope"><SelectValue/></SelectTrigger><SelectContent>{["all","personal","business"].map(v=><SelectItem key={v} value={v}>{v==="all"?"All spending":v}</SelectItem>)}</SelectContent></Select><Select value={account} onValueChange={setAccount}><SelectTrigger aria-label="Insight account"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All accounts</SelectItem>{accounts.map(a=><SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select><Select value={payment} onValueChange={setPayment}><SelectTrigger aria-label="Insight payment method"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All payment methods</SelectItem>{PAYMENT_METHODS.map(v=><SelectItem key={v} value={v}>{PAYMENT_LABEL[v]}</SelectItem>)}</SelectContent></Select><Input aria-label="Search insights" placeholder="Merchant, title or tag" value={query} onChange={e=>setQuery(e.target.value)}/></div>
      <section className="mb-8 grid gap-6 lg:grid-cols-2"><div><h2 className="font-display text-lg font-bold">Monthly income & spending</h2><ResponsiveContainer width="100%" height={240}><BarChart data={monthly}><XAxis dataKey="label"/><Tooltip formatter={(v:number)=>money(v)}/><Bar dataKey="income" fill="var(--chart-2)"/><Bar dataKey="spent" fill="var(--chart-1)"/></BarChart></ResponsiveContainer></div><div><h2 className="font-display text-lg font-bold">Weekly spending</h2><ResponsiveContainer width="100%" height={240}><BarChart data={weekly}><XAxis dataKey="label"/><Tooltip formatter={(v:number)=>money(v)}/><Bar dataKey="spent" fill="var(--chart-3)"/></BarChart></ResponsiveContainer></div><div><h2 className="font-display text-lg font-bold">Net worth over time</h2><ResponsiveContainer width="100%" height={240}><BarChart data={worth}><XAxis dataKey="label"/><Tooltip formatter={(v:number)=>money(v)}/><Bar dataKey="netWorth" fill="var(--chart-4)"/></BarChart></ResponsiveContainer></div><div><h2 className="font-display text-lg font-bold">Month comparison</h2><p className="my-2 text-sm">This month {money(cmp.total.now)} · same period last month {money(cmp.total.before)} · change {money(cmp.total.delta)}</p><ul className="divide-y text-sm">{cmp.rows.slice(0,6).map(x=><li key={x.category} className="flex justify-between py-2"><span>{x.category}</span><span>{money(x.delta)}</span></li>)}</ul></div>{[{title:"Top merchants",rows:merchants},{title:"Spending by account",rows:byAccount}].map(x=><div key={x.title}><h2 className="font-display text-lg font-bold">{x.title}</h2><ul className="divide-y text-sm">{x.rows.map(r=><li key={r.name} className="flex justify-between gap-3 py-2"><span>{r.name}</span><span>{money(r.amount)}</span></li>)}</ul></div>)}</section>
      <section className="mb-8">
        <h2 className="font-display text-xl font-bold">Category spending</h2>
        <ResponsiveContainer width="100%" height={260}><BarChart data={categoryRows}><XAxis dataKey="name" tick={{fontSize:11}}/><Tooltip formatter={(v:number)=>money(v)}/><Bar dataKey="amount" fill="var(--chart-1)" onClick={data=>setSelectedCategory(String(data.name))}/></BarChart></ResponsiveContainer>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}><SelectTrigger aria-label="Insight category"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{categoryRows.map(c=><SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent></Select>
        <div className="mt-4"><ExpenseTable items={list.filter(e=>selectedCategory==="all"||e.category===selectedCategory)} empty="No transactions in this range." /></div>
      </section>
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
