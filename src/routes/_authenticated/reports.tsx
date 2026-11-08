import { effectiveEntity } from "@/lib/books/entity-accounts";
import { SectionTabs } from "@/components/SectionTabs";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";
import { PageTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { applyFilters } from "@/lib/expenses";
import { buildReport, deliverFile, toCsv, toExcel, toPdf, type ReportKind } from "@/lib/reports";
import { useStore } from "@/lib/store";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, LineChart, Line, YAxis } from "recharts";
import { tagValue } from "@/lib/preferences";
import { money, totalsBy, categoryTotals } from "@/lib/expenses";
import { ExpenseTable } from "@/components/ExpenseTable";
import { monthlySeries, weeklySpend, netWorthSeries, spendBy, monthToDateCompare, subscriptionSpendSeries, cardUtilisationSeries, loanProgress, savingsTrend } from "@/lib/insights";
import { isTracked, stageOf, REIMB_STAGES, REIMB_STAGE_LABEL } from "@/lib/reimbursements";
import { PAYMENT_METHODS, PAYMENT_LABEL, type Scope } from "@/lib/expenses";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Ledgerline" },
      { name: "description", content: "Export expenses, actual reimbursement payments and department budget summaries as CSV or PDF." },
      { property: "og:title", content: "Reports — Ledgerline" },
      { property: "og:description", content: "Download expense entries, reimbursement payments and department budget summaries." },
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
  { kind: "reimbursement-payments", title: "Reimbursement payments", desc: "Money actually received, with linked claims and receiving accounts." },
  { kind: "departments", title: "Department budgets", desc: "Your filtered spending against saved department limits; excludes other people's records. Missing labels appear as Unassigned." },
];

function Reports() {
  const { transactions, accounts, valuations, memberName, members, budgets, commitments, loans, preferences, departmentBudgets, departmentBudgetError } = useStore();
  const [budgetMonth, setBudgetMonth] = useState(new Date().toISOString().slice(0, 7));
  const [prepared, setPrepared] = useState<Record<string, { blob: Blob; key: string }>>({});
  const [preparing, setPreparing] = useState<ReportKind | null>(null);
  const [tagGroup,setTagGroup]=useState<Record<string,string>>({});
  const [drill,setDrill]=useState<{label:string;from?:string;to?:string;merchant?:string;account?:string}|null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [member, setMember] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [catShown, setCatShown] = useState(50);
  const [scope,setScope]=useState<Scope|"all">("all");const [account,setAccount]=useState("all");const [payment,setPayment]=useState("all");const [query,setQuery]=useState("");
  const [department,setDepartment]=useState("all");const [status,setStatus]=useState("all");const [receipt,setReceipt]=useState("all");
  const filterKey = [from, to, member, selectedCategory, scope, account, payment, query, department, status, receipt, JSON.stringify(tagGroup)].join("|");
  useEffect(() => setCatShown(50), [filterKey]);
  const departmentOptions=[...new Set([...Object.keys(departmentBudgets),...transactions.map(e=>e.department?.trim()||"").filter(Boolean)])].sort();
  const filtered = applyFilters(transactions, { from, to, memberId: member, scope, accountId:account, paymentMethod:payment, query, tagAll:Object.values(tagGroup).filter(v=>v!=="all"), department, receipt: receipt as "all" | "with" | "without" })
    .filter(e=>status==="all"||(status==="none"?!isTracked(e):isTracked(e)&&stageOf(e)===status));
  const list=filtered.filter(e=>(e.txnType??"expense")==="expense");
  const tagGroups=[...new Set(preferences.tags.map(t=>t.group))];
  const drillRows=drill?list.filter(e=>(!drill.from||e.date>=drill.from)&&(!drill.to||e.date<=drill.to)&&(!drill.merchant||(e.merchant||e.title)===drill.merchant)&&(!drill.account||(accounts.find(a=>a.id===e.accountId)?.name??"Unassigned")===drill.account)):[];
  const monthEndOf=(m:string)=>{const [y,mo]=m.split("-").map(Number);return new Date(Date.UTC(y!,mo!,0)).toISOString().slice(0,10);};
  const categoryRows = Object.entries(categoryTotals(list)).map(([name,amount])=>({name,amount}));
  const categoryList = list.filter(e=>selectedCategory==="all"||e.category===selectedCategory);
  const stamp = new Date().toISOString().slice(0, 10);
  const monthly=monthlySeries(filtered,stamp,12);const weekly=weeklySpend(filtered,stamp,8);const worth=netWorthSeries(accounts,transactions,valuations,stamp,12).map(x=>({...x,netWorth:x.net}));const cmp=monthToDateCompare(filtered,stamp);
  const subs=subscriptionSpendSeries(list,commitments,stamp,6);const util=cardUtilisationSeries(accounts,transactions,stamp,6);const cardNames=accounts.filter(a=>a.kind==="credit_card"&&(a.creditLimit??0)>0).map(a=>a.name);const loanRows=loanProgress(loans);const savings=savingsTrend(filtered,stamp,12);
  const merchants=spendBy(list,e=>e.merchant||e.title,10);const byAccount=spendBy(list,e=>accounts.find(a=>a.id===e.accountId)?.name??"Unassigned",10);
  const subtitle = `${member === "all" ? "Everyone" : memberName(member === "me" ? null : member)} · ${from || "start"} to ${to || "today"} · ${department === "all" ? "All departments" : department === "unassigned" ? "Unassigned department" : department} · ${status === "all" ? "Any status" : status === "none" ? "Not tracked" : REIMB_STAGE_LABEL[status as keyof typeof REIMB_STAGE_LABEL] ?? status} · ${receipt === "all" ? "Any receipts" : receipt === "with" ? "With receipts" : "Without receipts"} · amounts in INR · generated ${stamp}`;

  const departmentSummary = (() => {
    const exps = filtered.filter(e => (e.txnType ?? "expense") === "expense");
    const names = [...new Set([...exps.map(e => e.department?.trim() || "Unassigned"), ...Object.keys(departmentBudgets)])].sort();
    return names.map(name => {
      const entries = exps.filter(e => (e.department?.trim() || "Unassigned") === name && e.date.startsWith(budgetMonth));
      const spent = Math.round(entries.reduce((s, e) => s + e.amount * 100, 0)) / 100;
      const limit = departmentBudgets[name];
      return { name, spent, limit, remaining: limit === undefined ? 0 : Math.round((limit - spent) * 100) / 100, pct: limit && limit > 0 ? Math.round(spent / limit * 1000) / 10 : 0 };
    });
  })();
  const report = (k: ReportKind) => buildReport(k, filtered, memberName, budgets, { departmentBudgets, budgetMonth, claims: transactions, accountName: id => accounts.find(a => a.id === id)?.name ?? "Unassigned", ...((preferences.entities ?? []).length ? { companyOf: (e: import("@/lib/expenses").Expense) => { const k = effectiveEntity(e, preferences.books?.entityAccounts ?? {}); return k ? (preferences.entities ?? []).find(x => x.id === k)?.name ?? "" : "Personal"; } } : {}) });
  const csv = (k: ReportKind) => void deliverFile(new Blob(["\uFEFF", toCsv(report(k))], { type: "text/csv;charset=utf-8" }), `ledgerline-${k}-${stamp}.csv`).catch(() => toast.error("Couldn't download the CSV"));
  const pdf = async (k: ReportKind) => {
    const r = report(k), key = JSON.stringify([r, subtitle]);
    const ready = prepared[k];
    if (ready?.key === key) { await deliverFile(ready.blob, `ledgerline-${k}-${stamp}.pdf`); return; }
    setPreparing(k);
    try { const blob = await toPdf(r, subtitle); setPrepared(p => ({ ...p, [k]: { blob, key } })); } catch { toast.error("Couldn't create the PDF"); } finally { setPreparing(null); }
  };

  return (
    <div className="uix-family-reports">
      <SectionTabs group="reports" active="charts" /><PageTitle eyebrow="Insights" title="Spending & reports" />
      <details className="report-filters mb-6 border-y py-4"><summary className="font-medium">Filter report records</summary><div className="mt-4 grid gap-4 sm:grid-cols-4 sm:items-end">
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
      <div className="mb-6 grid gap-3 sm:grid-cols-4"><Select value={department} onValueChange={setDepartment}><SelectTrigger aria-label="Filter by department"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All departments</SelectItem><SelectItem value="unassigned">Unassigned</SelectItem>{departmentOptions.map(d=><SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select><Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="Filter by reimbursement status"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Any status</SelectItem><SelectItem value="none">Not tracked</SelectItem>{REIMB_STAGES.map(s=><SelectItem key={s} value={s}>{REIMB_STAGE_LABEL[s]}</SelectItem>)}</SelectContent></Select><Select value={receipt} onValueChange={setReceipt}><SelectTrigger aria-label="Filter by receipt attachment"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Any receipts</SelectItem><SelectItem value="with">With receipts</SelectItem><SelectItem value="without">Without receipts</SelectItem></SelectContent></Select></div>
      {tagGroups.length>0&&<div className="mb-6 grid gap-3 sm:grid-cols-4">{tagGroups.map(g=><Select key={g} value={tagGroup[g]??"all"} onValueChange={v=>setTagGroup(x=>({...x,[g]:v}))}><SelectTrigger aria-label={`Filter by ${g}`}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Any {g.toLowerCase()}</SelectItem>{preferences.tags.filter(t=>t.group===g).map(t=><SelectItem key={tagValue(t)} value={tagValue(t)}>{t.name}</SelectItem>)}</SelectContent></Select>)}</div>}
      </details>
      {drill&&<section className="mb-8 rounded-3xl border bg-card p-5"><div className="mb-3 flex items-center justify-between gap-3"><h2 className="font-display text-lg font-bold">Entries: {drill.label}</h2><Button variant="outline" size="sm" onClick={()=>setDrill(null)}>Close</Button></div><ExpenseTable items={drillRows} empty="No matching entries."/></section>}
      <p className="mb-3 text-xs text-muted-foreground">Tap a bar or row to see the entries behind it.</p>
      <section className="mb-8 grid gap-6 lg:grid-cols-2"><div><h2 className="font-display text-lg font-bold">Monthly income & spending</h2><ResponsiveContainer width="100%" height={240}><BarChart data={monthly}><XAxis dataKey="label"/><Tooltip formatter={(v:number)=>money(v)}/><Bar dataKey="income" fill="var(--chart-2)"/><Bar dataKey="spent" fill="var(--chart-1)" cursor="pointer" onClick={(d:{month?:string;label?:string})=>d.month&&setDrill({label:`${d.label} spending`,from:`${d.month}-01`,to:monthEndOf(d.month)})}/></BarChart></ResponsiveContainer></div><div><h2 className="font-display text-lg font-bold">Weekly spending</h2><ResponsiveContainer width="100%" height={240}><BarChart data={weekly}><XAxis dataKey="label"/><Tooltip formatter={(v:number)=>money(v)}/><Bar dataKey="spent" fill="var(--chart-3)" cursor="pointer" onClick={(d:{week?:string;label?:string})=>{if(!d.week)return;const e=new Date(d.week+"T00:00:00Z");e.setUTCDate(e.getUTCDate()+6);setDrill({label:`Week of ${d.label}`,from:d.week,to:e.toISOString().slice(0,10)});}}/></BarChart></ResponsiveContainer></div><div><h2 className="font-display text-lg font-bold">My total financial position over time</h2><ResponsiveContainer width="100%" height={240}><BarChart data={worth}><XAxis dataKey="label"/><Tooltip formatter={(v:number)=>money(v)}/><Bar dataKey="netWorth" fill="var(--chart-4)"/></BarChart></ResponsiveContainer></div><div><h2 className="font-display text-lg font-bold">Month comparison</h2><p className="my-2 text-sm">This month {money(cmp.total.now)} · same period last month {money(cmp.total.before)} · change {money(cmp.total.delta)}</p><ul className="divide-y text-sm">{cmp.rows.slice(0,6).map(x=><li key={x.category} className="flex justify-between py-2"><span>{x.category}</span><span>{money(x.delta)}</span></li>)}</ul></div><div><h2 className="font-display text-lg font-bold">Subscription spending</h2><ResponsiveContainer width="100%" height={240}><BarChart data={subs}><XAxis dataKey="label"/><Tooltip formatter={(v:number)=>money(v)}/><Bar dataKey="spent" name="Paid" fill="var(--chart-5)"/><Bar dataKey="scheduled" name="Scheduled monthly" fill="var(--chart-2)"/></BarChart></ResponsiveContainer></div><div><h2 className="font-display text-lg font-bold">How much of each card limit I use</h2>{cardNames.length?<ResponsiveContainer width="100%" height={240}><LineChart data={util}><XAxis dataKey="label"/><YAxis unit="%" width={40}/><Tooltip formatter={(v:number)=>`${v}%`}/>{cardNames.map((n,i)=><Line key={n} dataKey={n} stroke={`var(--chart-${(i%5)+1})`} strokeWidth={2}/>)}</LineChart></ResponsiveContainer>:<p className="text-sm text-muted-foreground">Add a credit limit to a card to see utilisation.</p>}</div><div><h2 className="font-display text-lg font-bold">Loan progress</h2>{loanRows.length?<ul className="grid gap-3 text-sm">{loanRows.map(l=><li key={l.name}><div className="flex justify-between"><span>{l.name}</span><span>{l.pct}% repaid · {money(l.outstanding)} left</span></div><div className="mt-1 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-gold" style={{width:`${l.pct}%`}}/></div></li>)}</ul>:<p className="text-sm text-muted-foreground">No loans with an original amount yet.</p>}</div><div><h2 className="font-display text-lg font-bold">Savings trend</h2><ResponsiveContainer width="100%" height={240}><LineChart data={savings}><XAxis dataKey="label"/><Tooltip formatter={(v:number)=>money(v)}/><Line dataKey="saved" name="Saved this month" stroke="var(--chart-2)" strokeWidth={2}/><Line dataKey="cumulative" name="Cumulative" stroke="var(--chart-4)" strokeWidth={2}/></LineChart></ResponsiveContainer></div>{[{title:"Top merchants",rows:merchants},{title:"Spending by account",rows:byAccount}].map(x=><div key={x.title}><h2 className="font-display text-lg font-bold">{x.title}</h2><ul className="divide-y text-sm">{x.rows.map(r=><li key={r.name}><button type="button" className="flex w-full justify-between gap-3 py-2 text-left hover:text-primary" onClick={()=>setDrill(x.title==="Top merchants"?{label:r.name,merchant:r.name}:{label:r.name,account:r.name})}><span>{r.name}</span><span>{money(r.amount)}</span></button></li>)}</ul></div>)}</section>
      <section className="mb-8">
        <h2 className="font-display text-xl font-bold">Category spending</h2>
        <ResponsiveContainer width="100%" height={260}><BarChart data={categoryRows}><XAxis dataKey="name" tick={{fontSize:11}}/><Tooltip formatter={(v:number)=>money(v)}/><Bar dataKey="amount" fill="var(--chart-1)" onClick={data=>setSelectedCategory(String(data.name))}/></BarChart></ResponsiveContainer>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}><SelectTrigger aria-label="Insight category"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{categoryRows.map(c=><SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent></Select>
        <div className="mt-4"><ExpenseTable items={categoryList.slice(0, catShown)} empty="No transactions in this range." />{categoryList.length > catShown && <div className="mt-4 flex flex-col items-center gap-1"><Button variant="outline" onClick={() => setCatShown((n) => n + 50)}>Show 50 more</Button><span className="text-xs text-muted-foreground">Showing {catShown} of {categoryList.length}</span></div>}</div>
      </section>
      <section className="mb-4 flex flex-wrap items-end gap-3"><div className="grid gap-1"><Label htmlFor="budget-month">Budget comparison month</Label><Input id="budget-month" type="month" value={budgetMonth} onChange={e => setBudgetMonth(e.target.value)} /></div>{departmentBudgetError && <p className="text-sm text-destructive">Department limits couldn't load. Try refreshing before exporting.</p>}</section>
      <section className="mb-8 rounded-3xl border bg-card p-5">
        <h2 className="font-display text-xl font-bold">Department budget summary</h2>
        <p className="mb-3 text-sm text-muted-foreground">Your filtered spending in {budgetMonth} against each saved monthly limit.</p>
        <ul className="grid gap-3 text-sm">
          {departmentSummary.map((d) => (
            <li key={d.name}>
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-semibold">{d.name}</span>
                <span>{d.limit === undefined ? "No limit saved" : `${money(d.spent)} of ${money(d.limit)} · ${d.pct}% used · ${money(d.remaining)} ${d.remaining < 0 ? "over" : "left"}`}</span>
              </div>
              {d.limit !== undefined && <div className="mt-1 h-2 rounded-full bg-muted"><div className={`h-2 rounded-full ${d.remaining < 0 ? "bg-destructive" : "bg-gold"}`} style={{ width: `${Math.min(100, d.pct)}%` }} /></div>}
            </li>
          ))}
          {departmentSummary.length === 0 && <li className="text-muted-foreground">No departments in the current filter. Save department limits in Settings to compare.</li>}
        </ul>
      </section>
      <div className="grid gap-4 md:grid-cols-3">
        {KINDS.map((k) => (
          <div key={k.kind} className="flex flex-col rounded-lg border bg-card p-5">
            <h2 className="font-display text-xl font-bold">{k.title}</h2>
            <p className="mt-1 flex-1 text-sm text-muted-foreground">{k.desc}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" aria-label={`Export ${k.title} CSV`} disabled={k.kind === "departments" && departmentBudgetError} onClick={() => csv(k.kind)}><FileSpreadsheet className="mr-1 h-4 w-4" />CSV</Button>
              <Button variant="outline" size="sm" aria-label={`Export ${k.title} Excel`} disabled={k.kind === "departments" && departmentBudgetError} onClick={async () => { try { await deliverFile(await toExcel(report(k.kind)), `ledgerline-${k.kind}-${stamp}.xlsx`); } catch { toast.error("Couldn't download Excel"); } }}><FileSpreadsheet className="mr-1 h-4 w-4" />Excel</Button>
              <Button size="sm" aria-label={`${prepared[k.kind]?.key === JSON.stringify([report(k.kind), subtitle]) ? "Download" : "Prepare"} ${k.title} PDF`} disabled={preparing !== null || (k.kind === "departments" && departmentBudgetError)} onClick={() => void pdf(k.kind).catch(() => toast.error("Couldn't download the PDF"))}>{prepared[k.kind]?.key === JSON.stringify([report(k.kind), subtitle]) ? <Download className="mr-1 h-4 w-4" /> : <FileText className="mr-1 h-4 w-4" />}{preparing === k.kind ? "Preparing…" : prepared[k.kind]?.key === JSON.stringify([report(k.kind), subtitle]) ? "Download PDF" : "Prepare PDF"}</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
