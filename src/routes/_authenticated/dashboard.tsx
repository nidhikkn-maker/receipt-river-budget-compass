import { NetWorthCard } from "@/components/books/NetWorthCard";
import { HomeModePicker } from "@/components/HomeModePicker";
import { HomeShortcuts } from "@/components/HomeShortcuts";
import { MilestoneBanner } from "@/components/MilestoneBanner";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, AlertTriangle, CircleHelp, ShieldQuestion, Plane } from "lucide-react";
import { PaymentReminders } from "@/components/PaymentReminders";
import { Autopilot } from "@/components/Autopilot";
import { Stat } from "@/components/AppShell";
import { ExpenseTable } from "@/components/ExpenseTable";
import { money, totalsByScope, type Expense, type Scope, SCOPE_LABEL, ACTIVE_SCOPES } from "@/lib/expenses";
import { workspaceParts } from "@/lib/workspaces";
import { useStore } from "@/lib/store";
import { accountBalance, cashflow, isLiability } from "@/lib/ledger";
import { usePosition } from "@/lib/use-position";
import { todayISO, useAssistantFacts } from "@/lib/use-position";
import { lazy, Suspense, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { askAssistant } from "@/lib/assistant.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { scopedBudgetUsage } from "@/lib/preferences";
import { addDays } from "@/lib/planning";
import { freshnessSummary } from "@/lib/inbox";
import { tripSummary } from "@/lib/intelligence";
import { cardBalanceSeries, cardRecency, cardTrendKeys, statementCaption, updatedCaption } from "@/lib/card-trend";
const CardTrendChart = lazy(() => import("@/components/CardTrendChart").then((m) => ({ default: m.CardTrendChart })));

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

type Readiness = { status: "Healthy" | "Attention required" | "Potential shortfall" | "Verification pending" | "Information incomplete"; detail: string; estimated: boolean };

function Overview() {
  const { expenses, transactions, accounts, preferences, savePreferences } = useStore();
  const today = todayISO();
  const scope: Scope | "all" = preferences.homeScope;

  // §1 — period range (Today / 7 days / This month / Custom)
  const customOk = preferences.homeCustomStart && preferences.homeCustomEnd;
  const start = preferences.homePeriod === "day" ? today
    : preferences.homePeriod === "week" ? addDays(today, -6)
    : preferences.homePeriod === "custom" && customOk ? preferences.homeCustomStart
    : today.slice(0, 7) + "-01";
  const end = preferences.homePeriod === "custom" && customOk ? preferences.homeCustomEnd : today;
  const periodLabel = preferences.homePeriod === "day" ? "today" : preferences.homePeriod === "week" ? "in the last 7 days" : preferences.homePeriod === "custom" ? "in the selected range" : "this month";

  /** Share of an entry that belongs to the selected workspace. */
  const share = (e: Expense) => (scope === "all" ? e.amount : (workspaceParts(e).find((p) => p.workspace === scope)?.amount ?? 0));
  const inRange = expenses.filter((e) => e.date >= start && e.date <= end);
  const scoped = inRange.filter((e) => share(e) > 0);
  const total = scoped.reduce((s, e) => s + share(e), 0);
  const byWorkspace = totalsByScope(inRange);

  // Previous-period comparison (same length, immediately before)
  const len = Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 864e5) + 1);
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(start, -len);
  const prevTotal = expenses.filter((e) => e.date >= prevStart && e.date <= prevEnd).reduce((s, e) => s + share(e), 0);
  const delta = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;

  // §2 — readiness
  const pos = usePosition(30);
  const live = accounts.filter((a) => !a.archived);
  const fresh = freshnessSummary(accounts, transactions, preferences, today);
  const unmatched = expenses.filter((e) => !e.reconciledAt && ["upi", "credit_card", "debit_card", "forex_card", "bank_transfer"].includes(e.paymentMethod)).length;
  const readiness: Readiness = !live.length
    ? { status: "Information incomplete", detail: "Add your accounts so balances and safe-to-spend can be calculated.", estimated: true }
    : fresh.lowConfidence
      ? { status: "Verification pending", detail: `${fresh.label} — confirm ${fresh.outdatedCritical[0] ?? "an account"} to firm up these figures.`, estimated: true }
      : pos.forecast.shortDates.length
        ? { status: "Potential shortfall", detail: `Money runs short from ${pos.forecast.shortDates[0]} if planned payments go ahead.`, estimated: false }
        : pos.alerts.length || pos.reimbursements.pendingCount
          ? { status: "Attention required", detail: pos.alerts[0]?.text ?? `${pos.reimbursements.pendingCount} reimbursements waiting.`, estimated: false }
          : { status: "Healthy", detail: "Accounts verified, no shortfall expected in the next 30 days.", estimated: false };
  const readinessIcon = readiness.status === "Healthy" ? <CheckCircle2 className="h-5 w-5 text-success" />
    : readiness.status === "Information incomplete" ? <CircleHelp className="h-5 w-5 text-info" />
    : readiness.status === "Verification pending" ? <ShieldQuestion className="h-5 w-5 text-warning" />
    : <AlertTriangle className="h-5 w-5 text-warning" />;

  // §3 — metrics
  const month = today.slice(0, 7);
  const cash = live.filter((a) => a.includeInCash !== false && !isLiability(a.kind) && ["savings", "current", "cash", "wallet"].includes(a.kind)).reduce((s, a) => s + accountBalance(a, transactions), 0);
  const cardAccounts = live.filter((a) => a.kind === "credit_card");
  const cardRows = cardAccounts.map((a) => ({ id: a.id, name: a.name, bal: accountBalance(a, transactions), rec: cardRecency(a, transactions, preferences.statementBalances[a.id]?.date) })).filter((r) => Math.abs(r.bal) >= 0.005).sort((x, y) => y.bal - x.bal);
  const cardDue = cardRows.reduce((s, r) => s + r.bal, 0);
  const cardTrend = cardBalanceSeries(cardAccounts, transactions, 6, today);
  const cardTrendNames = cardTrendKeys(cardAccounts);
  const flow = cashflow(transactions, `${month}-01`, `${month}-31`);

  // §4 — insights: top categories + budget use
  const catTotals = new Map<string, number>();
  for (const e of scoped) catTotals.set(e.category, (catTotals.get(e.category) ?? 0) + share(e));
  const cats = [...catTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const catMax = cats[0]?.[1] ?? 1;

  // §8 — travel widget: nearest current or upcoming trip
  const trip = preferences.trips.filter((t) => t.end >= today).sort((a, b) => a.start.localeCompare(b.start))[0];
  const tripSum = trip ? tripSummary(trip, transactions) : null;

  const facts = useAssistantFacts();
  const ask = useServerFn(askAssistant);
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [duesOpen, setDuesOpen] = useState(false);

  const setPeriod = (homePeriod: typeof preferences.homePeriod) => void savePreferences({ ...preferences, homePeriod });
  const order = (id: string) => preferences.homeOrder.indexOf(id);
  const hidden = (id: string) => preferences.homeHidden.includes(id);

  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-3 flex justify-end"><HomeModePicker compact /></div>
      <HomeShortcuts />
      <NetWorthCard />
      {(scope === "business" || scope === "official") && (
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          <Link to="/expenditure-statement" className="rounded-xl border bg-card px-3 py-2 font-semibold text-primary">Generate {scope} statement</Link>
          <Link to="/claim-submission" className="rounded-xl border bg-card px-3 py-2 font-semibold text-primary">Expense claim</Link>
        </div>
      )}
      {/* §1 — Financial overview */}
      <section hidden={hidden("overview")} style={{ order: order("overview") }} className="mb-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {(["day", "week", "month", "custom"] as const).map((p) => (
            <Button key={p} size="sm" variant={preferences.homePeriod === p ? "default" : "outline"} onClick={() => setPeriod(p)}>
              {p === "day" ? "Today" : p === "week" ? "7 days" : p === "month" ? "This month" : "Custom"}
            </Button>
          ))}
          {preferences.homePeriod === "custom" && (
            <span className="flex items-center gap-1.5">
              <Input type="date" aria-label="From" className="h-8 w-36" value={preferences.homeCustomStart} onChange={(e) => void savePreferences({ ...preferences, homeCustomStart: e.target.value })} />
              <span className="text-muted-foreground">–</span>
              <Input type="date" aria-label="To" className="h-8 w-36" value={preferences.homeCustomEnd} onChange={(e) => void savePreferences({ ...preferences, homeCustomEnd: e.target.value })} />
            </span>
          )}
        </div>
        <div className="rounded-3xl border bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="font-mono text-[11px] font-semibold text-muted-foreground">
                {scope === "all" ? "Total expenditure" : `${SCOPE_LABEL[scope]} expenditure`} · {periodLabel}
              </div>
              <div className="mt-1 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{money(total)}</div>
              {delta !== null && (
                <div className="mt-1 text-sm font-semibold text-muted-foreground">
                  {delta > 0 ? "↑" : delta < 0 ? "↓" : "→"} {Math.abs(delta)}% vs the previous {len}-day period
                </div>
              )}
            </div>
            {scope === "all" && byWorkspace.total > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {ACTIVE_SCOPES.filter((s) => byWorkspace[s] > 0).map((s) => (
                  <span key={s} className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
                    {SCOPE_LABEL[s]} <b className="font-mono">{money(byWorkspace[s])}</b>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* §2 — Financial readiness */}
      <section hidden={hidden("readiness")} style={{ order: order("readiness") }} className="mb-5">
        <div className="flex items-center gap-3 rounded-3xl border bg-card p-4 sm:p-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-secondary">{readinessIcon}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-base font-bold">{readiness.status}</h2>
              {readiness.estimated && <span className="rounded-full border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Figures estimated</span>}
            </div>
            <p className="truncate text-sm text-muted-foreground" title={readiness.detail}>{readiness.detail}</p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[11px] font-semibold text-muted-foreground">Safe to spend{readiness.estimated && " · est."}</div>
            <div className="font-mono text-lg font-bold text-gold-strong">{live.length ? money(pos.safe.amount) : "—"}</div>
          </div>
          <Button asChild variant="outline" size="sm" className="hidden shrink-0 sm:inline-flex"><Link to="/review">Review</Link></Button>
        </div>
        <Autopilot />
      </section>

      {/* §3 — Essential metrics */}
      <section hidden={hidden("metrics")} style={{ order: order("metrics") }} className="mb-5 mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link to="/wealth"><Stat label="Available cash" value={live.length ? money(cash) : "—"} {...(live.length ? {} : { hint: "Add accounts" })} /></Link>
        <Stat label="Income this month" value={money(flow.income)} />
        <Link to="/plan"><Stat label="Safe to spend" value={live.length ? money(pos.safe.amount) : "—"} {...(readiness.estimated ? { hint: "Estimated" } : {})} /></Link>
        <details className="group col-span-1 [&[open]]:col-span-2 [&[open]]:lg:col-span-4 [&>summary::-webkit-details-marker]:hidden" onToggle={(e) => setDuesOpen(e.currentTarget.open)}>
          <summary className="cursor-pointer list-none" aria-label="Show card-by-card dues"><Stat label="Card dues" value={money(cardDue)} hint={cardRows.length ? `${cardRows.length} card${cardRows.length === 1 ? "" : "s"} · tap for breakdown` : "No card balances"} /></summary>
          <ul className="mt-2 divide-y rounded-2xl border bg-card px-4 text-sm">
            {cardRows.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <Link to="/cards/$accountId" params={{ accountId: r.id }} className="block min-w-0 truncate font-medium text-primary">{r.name}</Link>
                  <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{statementCaption(r.rec)} · {updatedCaption(r.rec)}</div>
                </div>
                <span className={"shrink-0 font-mono " + (r.bal < 0 ? "text-success" : "")}>{r.bal < 0 ? `${money(-r.bal)} credit` : money(r.bal)}</span>
              </li>
            ))}
            <li className="flex items-center justify-between gap-3 py-2 font-semibold"><span>Total owed</span><span className="font-mono">{money(cardDue)}</span></li>
          </ul>
          <div className="mt-3 rounded-2xl border bg-card p-3">
            <h3 className="font-display text-sm font-bold">Balance trend</h3>
            <p className="mb-1 text-[11px] text-muted-foreground">Amount owed at each month end · credit shows below zero · last 6 months</p>
            {duesOpen && <Suspense fallback={<div className="animate-pulse rounded-xl bg-muted" style={{ height: 180 }} />}><CardTrendChart points={cardTrend} names={cardTrendNames} height={180} /></Suspense>}
          </div>
        </details>
      </section>

      {/* §4 — Spending insights */}
      <section hidden={hidden("insights")} style={{ order: order("insights") }} className="mb-5 grid gap-3 lg:grid-cols-2">
        <div className="rounded-3xl border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-base font-bold">Spending by category</h2>
            <Link to="/reports" className="flex items-center gap-1 text-sm font-semibold text-primary">Reports <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
          {cats.length === 0 && <p className="py-4 text-sm text-muted-foreground">No spending in this period yet.</p>}
          <ul className="space-y-2.5">
            {cats.map(([cat, amt]) => (
              <li key={cat}>
                <div className="mb-1 flex justify-between gap-3 text-sm"><span className="min-w-0 truncate font-medium">{cat}</span><span className="shrink-0 font-mono font-semibold">{money(amt)}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(3, (amt / catMax) * 100)}%` }} /></div>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-3xl border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-base font-bold">Budget use</h2>
            <Link to="/budgets" className="flex items-center gap-1 text-sm font-semibold text-primary">Budgets <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
          {preferences.budgets.length === 0 && <p className="py-4 text-sm text-muted-foreground">Set a budget to track utilisation here.</p>}
          <ul className="space-y-2.5">
            {preferences.budgets.slice(0, 5).map((b) => {
              const u = scopedBudgetUsage(b, expenses, today);
              return (
                <li key={b.id}>
                  <div className="mb-1 flex justify-between gap-3 text-sm"><span className="min-w-0 truncate font-medium">{b.name}</span><span className="shrink-0 font-mono font-semibold">{money(u.spent)} / {money(u.allowance)}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className={"h-full rounded-full " + (u.percent > 100 ? "bg-destructive" : u.percent > 80 ? "bg-warning" : "bg-gold")} style={{ width: `${Math.min(100, Math.max(2, u.percent))}%` }} /></div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* §5 — Upcoming commitments */}
      <section hidden={hidden("upcoming")} style={{ order: order("upcoming") }} className="mb-5">
        <div className="rounded-3xl border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-base font-bold">Upcoming commitments</h2>
            <Link to="/plan" className="flex items-center gap-1 text-sm font-semibold text-primary">View all <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
          {pos.upcoming.length === 0 && <p className="py-2 text-sm text-muted-foreground">Nothing due soon — add bills and income in Plan.</p>}
          <ul className="divide-y">
            {pos.upcoming.slice(0, 4).map((u, k) => (
              <li key={k} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0 truncate font-medium">{u.name}</span>
                <span className="shrink-0 text-muted-foreground">{u.date.slice(5)} · <b className="font-mono text-foreground">{money(u.amount)}</b></span>
              </li>
            ))}
          </ul>
        </div>
        <PaymentReminders />
      </section>

      <MilestoneBanner />

      {/* §7 — AI briefing */}
      <section hidden={hidden("briefing")} style={{ order: order("briefing") }} className="mb-5">
        <div className="rounded-3xl border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-base font-bold">AI briefing</h2>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={busy || !preferences.aiEnabled} onClick={async () => { setBusy(true); try { const r = await ask({ data: { facts, messages: [{ role: "user", content: "Give a short briefing: recorded spending, upcoming dues, safe-to-spend, and the highest priority alert. Quote only the supplied facts." }] } }); setBrief(r.ok ? r.text : r.error); setBriefOpen(true); } catch { setBrief("Couldn't reach the assistant."); setBriefOpen(true); } finally { setBusy(false); } }}>{busy ? "Preparing…" : brief ? "Refresh" : "Get briefing"}</Button>
              <Button asChild size="sm" variant="ghost"><Link to="/assistant">Ask AI</Link></Button>
            </div>
          </div>
          {brief && (
            <div className="mt-3">
              <p className={"whitespace-pre-wrap text-sm " + (briefOpen ? "" : "line-clamp-3")}>{brief}</p>
              <button type="button" className="mt-1 text-sm font-semibold text-primary" onClick={() => setBriefOpen((o) => !o)}>{briefOpen ? "Collapse" : "View details"}</button>
            </div>
          )}
          {!brief && <p className="mt-2 text-sm text-muted-foreground">A short summary of spending changes, risks and what's next — on demand.</p>}
        </div>
      </section>

      {/* §8 — Contextual travel widget */}
      {trip && (
        <section hidden={hidden("travel")} style={{ order: order("travel") }} className="mb-5">
          <Link to="/trips" className="flex items-center gap-3 rounded-3xl border bg-card p-4 transition hover:shadow-float sm:p-5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gold-soft text-gold-strong"><Plane className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-base font-bold">{trip.name}{trip.destination ? ` · ${trip.destination}` : ""}</div>
              <div className="text-sm text-muted-foreground">{trip.start.slice(5)} → {trip.end.slice(5)}{trip.budget ? ` · ${money(tripSum?.total ?? 0)} of ${money(trip.budget)} spent` : ""}</div>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        </section>
      )}

      {/* §6 — Recent activity */}
      <section hidden={hidden("recent")} style={{ order: order("recent") }}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">Recent activity</h2>
          <Link to="/expenses" className="flex items-center gap-1 text-sm font-semibold text-primary">View all <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
        <ExpenseTable items={expenses.slice(0, 6)} empty="No expenses yet — tap + to add your first one." />
      </section>
    </div>
  );
}
