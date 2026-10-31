import { createFileRoute, Link } from "@tanstack/react-router";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { PaymentReminders } from "@/components/PaymentReminders";
import { Stat } from "@/components/AppShell";
import { ExpenseTable } from "@/components/ExpenseTable";
import { money, totalsByMember, totalsByScope } from "@/lib/expenses";
import { useStore } from "@/lib/store";
import { accountBalance, cashflow, isLiability } from "@/lib/ledger";
import { usePosition } from "@/lib/use-position";
import { todayISO, useAssistantFacts } from "@/lib/use-position";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { askAssistant } from "@/lib/assistant.functions";
import { Button } from "@/components/ui/button";
import { scopedBudgetUsage } from "@/lib/preferences";
import { addDays } from "@/lib/planning";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Home — Ledgerline" },
      { name: "description", content: "Your personal, family and business spending at a glance." },
      { property: "og:title", content: "Home — Ledgerline" },
      { property: "og:description", content: "Your personal, family and business spending at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Overview,
});

function Overview() {
  const { expenses, members, memberName, transactions, accounts, preferences, savePreferences } = useStore();
  const today=todayISO();
  const start=preferences.homePeriod==="day"?today:preferences.homePeriod==="week"?addDays(today,-6):today.slice(0,7)+"-01";
  const month = new Date().toISOString().slice(0, 7);
  const thisMonth = expenses.filter((e) => e.date>=start&&e.date<=today);
  const t = totalsByScope(thisMonth);
  const byMember = totalsByMember(thisMonth);
  const memberRows = [{ id: "me", name: "Me" }, ...members].map((m) => ({ name: m.id === "me" ? "Me" : memberName(m.id), value: byMember[m.id] ?? 0 })).filter((r) => r.value > 0);
  const unmatched = expenses.filter((e) => !e.reconciledAt && ["upi", "credit_card", "debit_card", "forex_card", "bank_transfer"].includes(e.paymentMethod)).length;
  const live = accounts.filter((a) => !a.archived);
  const cash = live.filter((a) => a.includeInCash!==false && !isLiability(a.kind) && ["savings", "current", "cash", "wallet"].includes(a.kind)).reduce((s, a) => s + accountBalance(a, transactions), 0);
  const cardDue = live.filter((a) => a.kind === "credit_card").reduce((s, a) => s + accountBalance(a, transactions), 0);
  const flow = cashflow(transactions, `${month}-01`, `${month}-31`);
  const pos = usePosition(30);
  const pct = t.total ? Math.round((t.business / t.total) * 100) : 0;
  const facts=useAssistantFacts();const ask=useServerFn(askAssistant);const [brief,setBrief]=useState("");const [busy,setBusy]=useState(false);

  return (
    <>
      <div className="mb-3 flex gap-2">{(["day","week","month"] as const).map(period=><Button key={period} size="sm" variant={preferences.homePeriod===period?"default":"outline"} onClick={()=>void savePreferences({...preferences,homePeriod:period})}>{period==="day"?"Today":period==="week"?"7 days":"This month"}</Button>)}</div>
      <section className="relative mb-6 overflow-hidden rounded-3xl bg-hero p-6 text-primary-foreground shadow-float sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full border-[28px] border-primary-foreground/10" />
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] opacity-80">{new Date().toLocaleString("en", { month: "long", year: "numeric" })}</div>
        <div className="mt-1 font-display text-4xl font-extrabold tracking-tight sm:text-6xl">{money(t.total)}</div>
        <div className="text-sm opacity-80">spent {preferences.homePeriod==="day"?"today":preferences.homePeriod==="week"?"in the last 7 days":"this month"}</div>
        <div className="mt-6 sm:max-w-md">
          <div className="flex h-3 overflow-hidden rounded-full bg-primary-foreground/20">
            <div className="bg-primary-foreground" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-sm">
            <span><b className="font-mono">{money(t.business)}</b> business</span>
            <span><b className="font-mono">{money(t.personal)}</b> personal</span>
          </div>
        </div>
      </section>

      <PaymentReminders />
      <div className="flex flex-col">
      <div hidden={preferences.homeHidden.includes("quick")} style={{order:preferences.homeOrder.indexOf("quick")}} className="mb-5 flex flex-wrap gap-2"><Button asChild><Link to="/new">Add entry</Link></Button><Button asChild variant="outline"><Link to="/vault">Upload document</Link></Button><Button asChild variant="outline"><Link to="/reconcile">Import statement</Link></Button><Button asChild variant="outline"><Link to="/plan">Plan a payment</Link></Button></div>
      <section hidden={preferences.homeHidden.includes("alerts")} style={{order:preferences.homeOrder.indexOf("alerts")}} className="mb-5"><h2 className="mb-2 font-display text-lg font-bold">Alerts</h2><ul className="divide-y">{pos.alerts.slice(0,6).map((a,i)=><li key={i} className="py-2 text-sm">{a.text}</li>)}</ul>{pos.reimbursements.count>0&&<p className="text-sm">Pending reimbursements: {money(pos.reimbursements.amount)} · {pos.reimbursements.count} claims</p>}</section>
      <section hidden={preferences.homeHidden.includes("briefing")} style={{order:preferences.homeOrder.indexOf("briefing")}} className="mb-5"><div className="flex items-center justify-between"><h2 className="font-display text-lg font-bold">Your money briefing</h2><Button size="sm" variant="outline" disabled={busy||!preferences.aiEnabled} onClick={async()=>{setBusy(true);try{const r=await ask({data:{facts,messages:[{role:"user",content:"Give a short briefing: recorded spending, upcoming dues, safe-to-spend, and the highest priority alert. Quote only the supplied facts."}]}});setBrief(r.ok?r.text:r.error);}catch{setBrief("Couldn't reach the assistant.");}finally{setBusy(false);}}}>{busy?"Preparing…":"Get briefing"}</Button></div>{brief&&<p className="mt-3 whitespace-pre-wrap text-sm">{brief}</p>}</section>
      <section hidden={preferences.homeHidden.includes("budget")} style={{order:preferences.homeOrder.indexOf("budget")}} className="mb-5"><h2 className="mb-2 font-display text-lg font-bold">Budget use</h2><ul className="divide-y">{preferences.budgets.map(b=>{const u=scopedBudgetUsage(b,expenses,today);return <li key={b.id} className="flex justify-between gap-3 py-2 text-sm"><span>{b.name}</span><span>{money(u.spent)} / {money(u.allowance)}</span></li>;})}</ul><Link to="/analytics" className="text-sm text-primary">View budgets</Link></section>
      <div hidden={preferences.homeHidden.includes("safe")} style={{order:preferences.homeOrder.indexOf("safe")}}>
      <Link to="/plan" className="mb-3 flex items-center gap-4 rounded-3xl border-2 border-primary bg-card p-4">
        <div className="flex-1">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Safe to spend · 30 days</div>
          <div className="font-mono text-2xl">{money(pos.safe.amount)}</div>
          <div className="text-xs text-muted-foreground">{pos.forecast.shortDates.length ? `Money runs short from ${pos.forecast.shortDates[0]}` : `Lowest point ${money(pos.safe.lowest)} on ${pos.safe.lowestDate}`}</div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          {pos.upcoming.slice(0, 3).map((u, k) => <div key={k}>{u.date.slice(5)} · {u.name} · <span className="font-mono">{money(u.amount)}</span></div>)}
          {!pos.upcoming.length && "Add bills & income in Plan"}
        </div>
      </Link>
      </div>
      <div hidden={preferences.homeHidden.includes("accounts")} style={{order:preferences.homeOrder.indexOf("accounts")}} className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link to="/wealth"><Stat label="Cash in accounts" value={money(cash)} {...(live.length ? {} : { hint: "Add accounts" })} /></Link>
        <Stat label="Income this month" value={money(flow.income)} />
        <Stat label="Net this month" value={money(flow.net)} hint="Income − spending, transfers excluded" />
        <Link to="/wealth"><Stat label="Card dues" value={money(cardDue)} /></Link>
      </div>
      <div hidden={preferences.homeHidden.includes("summary")} style={{order:preferences.homeOrder.indexOf("summary")}} className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat tone="business" label="Business (all time)" value={money(totalsByScope(expenses).business)} />
        <Stat tone="personal" label="Personal (all time)" value={money(totalsByScope(expenses).personal)} />
        <Stat label="Expenses this month" value={String(thisMonth.length)} />
        <Link to="/reconcile"><Stat label="Not yet matched to bank" value={String(unmatched)} hint="Tap to reconcile" /></Link>
      </div>

      {memberRows.length > 0 && (
        <div hidden={preferences.homeHidden.includes("family")} style={{order:preferences.homeOrder.indexOf("family")}} className="mb-8 rounded-3xl border bg-card p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Who spent this month</h2>
            <Link to="/family" className="text-sm text-primary">Manage family</Link>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={memberRows}>
              <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: "var(--secondary)" }} formatter={(v: number) => money(v)} />
              <Bar dataKey="value" fill="var(--chart-1)" radius={[10, 10, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div hidden={preferences.homeHidden.includes("recent")} style={{order:preferences.homeOrder.indexOf("recent")}}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-xl font-bold">Recent</h2>
        <Link to="/expenses" className="text-sm text-primary">See all</Link>
      </div>
      <ExpenseTable items={expenses.slice(0, 6)} empty="No expenses yet — tap Add to scan your first bill." />
      </div></div>
    </>
  );
}
