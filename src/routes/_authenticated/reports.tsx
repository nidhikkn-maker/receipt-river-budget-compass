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
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, LineChart, Line, YAxis } from "recharts";
import { tagValue } from "@/lib/preferences";
import { money, totalsBy, categoryTotals } from "@/lib/expenses";
import { ExpenseTable } from "@/components/ExpenseTable";
import { monthlySeries, weeklySpend, netWorthSeries, spendBy, monthToDateCompare, subscriptionSpendSeries, cardUtilisationSeries, loanProgress, savingsTrend } from "@/lib/insights";
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
  const { transactions, accounts, valuations, memberName, members, budgets, commitments, loans, preferences } = useStore();
  const [tagGroup,setTagGroup]=useState<Record<string,string>>({});
  const [drill,setDrill]=useState<{label:string;from?:string;to?:string;merchant?:string;account?:string}|null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [member, setMember] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [scope,setScope]=useState<Scope|"all">("all");const [account,setAccount]=useState("all");const [payment,setPayment]=useState("all");const [query,setQuery]=useState("");
  const filtered = applyFilters(transactions, { from, to, memberId: member, scope, accountId:account, paymentMethod:payment, query, tagAll:Object.values(tagGroup).filter(v=>v!=="all") });
  const list=filtered.filter(e=>(e.txnType??"expense")==="expense");
  const tagGroups=[...new Set(preferences.tags.map(t=>t.group))];
  const drillRows=drill?list.filter(e=>(!drill.from||e.date>=drill.from)&&(!drill.to||e.date<=drill.to)&&(!drill.merchant||(e.merchant||e.title)===drill.merchant)&&(!drill.account||(accounts.find(a=>a.id===e.accountId)?.name??"Unassigned")===drill.account)):[];
  const monthEndOf=(m:string)=>{const [y,mo]=m.split("-").map(Number);return new Date(Date.UTC(y!,mo!,0)).toISOString().slice(0,10);};
  const categoryRows = Object.entries(categoryTotals(list)).map(([name,amount])=>({name,amount}));
  const stamp = new Date().toISOString().slice(0, 10);
  const monthly=monthlySeries(filtered,stamp,12);const weekly=weeklySpend(filtered,stamp,8);const worth=netWorthSeries(accounts,transactions,valuations,stamp,12).map(x=>({...x,netWorth:x.net}));const cmp=monthToDateCompare(filtered,stamp);
  const subs=subscriptionSpendSeries(list,commitments,stamp,6);const util=cardUtilisationSeries(accounts,transactions,stamp,6);const cardNames=accounts.filter(a=>a.kind==="credit_card"&&(a.creditLimit??0)>0).map(a=>a.name);const loanRows=loanProgress(loans);const savings=savingsTrend(filtered,stamp,12);
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
      {tagGroups.length>0&&<div className="mb-6 grid gap-3 sm:grid-cols-4">{tagGroups.map(g=><Select key={g} value={tagGroup[g]??"all"} onValueChange={v=>setTagGroup(x=>({...x,[g]:v}))}><SelectTrigger aria-label={`Filter by ${g}`}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Any {g.toLowerCase()}</SelectItem>{preferences.tags.filter(t=>t.group===g).map(t=><SelectItem key={tagValue(t)} value={tagValue(t)}>{t.name}</SelectItem>)}</SelectContent></Select>)}</div>}
      {drill&&<section className="mb-8 rounded-3xl border bg-card p-5"><div className="mb-3 flex items-center justify-between gap-3"><h2 className="font-display text-lg font-bold">Entries: {drill.label}</h2><Button variant="outline" size="sm" onClick={()=>setDrill(null)}>Close</Button></div><ExpenseTable items={drillRows} empty="No matching entries."/></section>}
      <p className="mb-3 text-xs text-muted-foreground">Tap a bar or row to see the entries behind it.</p>
      <section className="mb-8 grid gap-6 lg:grid-cols-2"><div><h2 className="font-display text-lg font-bold">Monthly income & spending</h2><ResponsiveContainer width="100%" height={240}><BarChart data={monthly}><XAxis dataKey="label"/><Tooltip formatter={(v:number)=>money(v)}/><Bar dataKey="income" fill="var(--chart-2)"/><Bar dataKey="spent" fill="var(--chart-1)" cursor="pointer" onClick={(d:{month?:string;label?:string})=>d.month&&setDrill({label:`${d.label} spending`,from:`${d.month}-01`,to:monthEndOf(d.month)})}/></BarChart></ResponsiveContainer></div><div><h2 className="font-display text-lg font-bold">Weekly spending</h2><ResponsiveContainer width="100%" height={240}><BarChart data={weekly}><XAxis dataKey="label"/><Tooltip formatter={(v:number)=>money(v)}/><Bar dataKey="spent" fill="var(--chart-3)" cursor="pointer" onClick={(d:{week?:string;label?:string})=>{if(!d.week)return;const e=new Date(d.week+"T00:00:00Z");e.setUTCDate(e.getUTCDate()+6);setDrill({label:`Week of ${d.label}`,from:d.week,to:e.toISOString().slice(0,10)});}}/></BarChart></ResponsiveContainer></div><div><h2 className="font-display text-lg font-bold">Net worth over time</h2><ResponsiveContainer width="100%" height={240}><BarChart data={worth}><XAxis dataKey="label"/><Tooltip formatter={(v:number)=>money(v)}/><Bar dataKey="netWorth" fill="var(--chart-4)"/></BarChart></ResponsiveContainer></div><div><h2 className="font-display text-lg font-bold">Month comparison</h2><p className="my-2 text-sm">This month {money(cmp.total.now)} · same period last month {money(cmp.total.before)} · change {money(cmp.total.delta)}</p><ul className="divide-y text-sm">{cmp.rows.slice(0,6).map(x=><li key={x.category} className="flex justify-between py-2"><span>{x.category}</span><span>{money(x.delta)}</span></li>)}</ul></div><div><h2 className="font-display text-lg font-bold">Subscription spending</h2><ResponsiveContainer width="100%" height={240}><BarChart data={subs}><XAxis dataKey="label"/><Tooltip formatter={(v:number)=>money(v)}/><Bar dataKey="spent" name="Paid" fill="var(--chart-5)"/><Bar dataKey="scheduled" name="Scheduled monthly" fill="var(--chart-2)"/></BarChart></ResponsiveContainer></div><div><h2 className="font-display text-lg font-bold">Card utilisation</h2>{cardNames.length?<ResponsiveContainer width="100%" height={240}><LineChart data={util}><XAxis dataKey="label"/><YAxis unit="%" width={40}/><Tooltip formatter={(v:number)=>`${v}%`}/>{cardNames.map((n,i)=><Line key={n} dataKey={n} stroke={`var(--chart-${(i%5)+1})`} strokeWidth={2}/>)}</LineChart></ResponsiveContainer>:<p className="text-sm text-muted-foreground">Add a credit limit to a card to see utilisation.</p>}</div><div><h2 className="font-display text-lg font-bold">Loan progress</h2>{loanRows.length?<ul className="grid gap-3 text-sm">{loanRows.map(l=><li key={l.name}><div className="flex justify-between"><span>{l.name}</span><span>{l.pct}% repaid · {money(l.outstanding)} left</span></div><div className="mt-1 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-gold" style={{width:`${l.pct}%`}}/></div></li>)}</ul>:<p className="text-sm text-muted-foreground">No loans with an original amount yet.</p>}</div><div><h2 className="font-display text-lg font-bold">Savings trend</h2><ResponsiveContainer width="100%" height={240}><LineChart data={savings}><XAxis dataKey="label"/><Tooltip formatter={(v:number)=>money(v)}/><Line dataKey="saved" name="Saved this month" stroke="var(--chart-2)" strokeWidth={2}/><Line dataKey="cumulative" name="Cumulative" stroke="var(--chart-4)" strokeWidth={2}/></LineChart></ResponsiveContainer></div>{[{title:"Top merchants",rows:merchants},{title:"Spending by account",rows:byAccount}].map(x=><div key={x.title}><h2 className="font-display text-lg font-bold">{x.title}</h2><ul className="divide-y text-sm">{x.rows.map(r=><li key={r.name}><button type="button" className="flex w-full justify-between gap-3 py-2 text-left hover:text-primary" onClick={()=>setDrill(x.title==="Top merchants"?{label:r.name,merchant:r.name}:{label:r.name,account:r.name})}><span>{r.name}</span><span>{money(r.amount)}</span></button></li>)}</ul></div>)}</section>
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
