import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PageTitle } from "@/components/AppShell";
import { Card, Row, fieldCls } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { budgetUsage, money } from "@/lib/expenses";
import { freshnessSummary, inboxCounts, inboxItems } from "@/lib/inbox";
import { briefDue, weeklyBrief, type WeeklyBrief } from "@/lib/intelligence";
import { downloadBlob, toPdf } from "@/lib/reports";
import { useStore } from "@/lib/store";
import { useWebMCP } from "use-webmcp-tool";
import { runWebMCPTool } from "@/lib/webmcp-telemetry";
import { todayISO, usePosition } from "@/lib/use-position";

export const Route = createFileRoute("/_authenticated/brief")({
  head: () => ({
    meta: [
      { title: "Weekly financial brief · Ledgerline" },
      { name: "description", content: "Your week in one page: spending, income, upcoming payments, attention items and up to three recommendations." },
      { property: "og:title", content: "Weekly brief · Ledgerline" },
      { property: "og:description", content: "A concise weekly executive summary of your finances." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Brief,
});
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function Brief() {
  const store = useStore();
  const { preferences: pr, savePreferences, transactions, accounts, commitments, valuations, expenses, budgets, pendingCount } = store;
  const p = usePosition(14);
  const today = todayISO();
  const live = useMemo(() => {
    const f = freshnessSummary(accounts, transactions, pr, today);
    const inbox = inboxCounts(inboxItems({ transactions, accounts, commitments, prefs: pr, today, pendingCount }), pr.inboxDismissed);
    const warn = budgetUsage(expenses, budgets, today.slice(0, 7)).filter((b) => b.budget > 0 && b.spent >= b.budget * 0.9).map((b) => `${b.category} ${Math.round((b.spent / b.budget) * 100)}%`);
    return weeklyBrief({ txns: transactions, accounts, valuations, commitments, upcoming: p.upcoming, lowest: p.safe.lowest, floor: p.minBalance + p.reserves, staleAccounts: f.rows.filter((r) => r.status === "outdated").map((r) => r.name), pendingReimbursements: p.reimbursements.pendingAmount, missingItems: inbox.open.length, budgetWarnings: warn, today });
  }, [transactions, accounts, commitments, valuations, expenses, budgets, pr, today, pendingCount, p]);
  const [viewing, setViewing] = useState<{ generatedAt: string; data: WeeklyBrief } | null>(null);
  const b = viewing?.data ?? live;
  const generate = async (auto = false) => {
    const entry = { id: crypto.randomUUID(), generatedAt: new Date().toISOString(), data: live };
    try { await savePreferences({ ...pr, briefs: [entry, ...pr.briefs].slice(0, 26) }); if (!auto) toast.success("Brief saved"); } catch (e) { toast.error((e as Error).message); }
  };
  // In-app scheduling: when you open the app after your chosen day/time, this week's brief is generated once.
  const ran = useRef(false);
  useEffect(() => { if (!ran.current && briefDue(pr.brief, pr.briefs[0]?.generatedAt ?? null, new Date())) { ran.current = true; void generate(true); } });
  const text = () => [`Week ${b.period.start} to ${b.period.end}`, `Spent ${money(b.snapshot.spent)} · Income ${money(b.snapshot.income)} · Net ${money(b.snapshot.net)}`, b.highlights.topCategory ? `Top: ${b.highlights.topCategory.category} ${money(b.highlights.topCategory.amount)}` : "", `Due next 7 days: ${money(b.upcoming.dueTotal)}`, ...b.recommendations.map((r, k) => `${k + 1}. ${r}`)].filter(Boolean).join("\n");
  const share = async () => { try { if (navigator.share) await navigator.share({ title: "Weekly brief", text: text() }); else { await navigator.clipboard.writeText(text()); toast.success("Copied"); } } catch { /* cancelled */ } };
  const pdf = async () => {
    const rows = [["Snapshot", "Spent", money(b.snapshot.spent)], ["Snapshot", "Income", money(b.snapshot.income)], ["Snapshot", "Net", money(b.snapshot.net)], ["Snapshot", "Previous week spent", money(b.snapshot.prevSpent)],
      ...b.highlights.significant.map((t) => ["Significant", `${t.date} ${t.title}`, money(t.amount)]), ...b.upcoming.due.map((u) => ["Due", `${u.date} ${u.name}`, money(u.amount)]), ...b.upcoming.income.map((u) => ["Income expected", `${u.date} ${u.name}`, money(u.amount)]),
      ...b.recommendations.map((r, k) => ["Recommendation", `${k + 1}. ${r}`, ""])];
    downloadBlob(await toPdf({ title: `Weekly brief ${b.period.start} – ${b.period.end}`, headers: ["Section", "Item", "Amount"], rows }, "Verified figures from Ledgerline"), `weekly-brief-${b.period.end}.pdf`);
  };
  useWebMCP({
    name: "read_weekly_brief",
    description: "Read the weekly financial brief currently shown: spending, income, upcoming payments, attention items and recommendations.",
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: () => runWebMCPTool("read_weekly_brief", () => text()),
  });
  useWebMCP({
    name: "save_weekly_brief",
    description: "Generate this week's brief from current figures and save it to the brief archive.",
    enabled: !viewing,
    execute: () => runWebMCPTool("save_weekly_brief", async () => { const entry = { id: crypto.randomUUID(), generatedAt: new Date().toISOString(), data: live }; await savePreferences({ ...pr, briefs: [entry, ...pr.briefs].slice(0, 26) }); return "Saved this week's brief."; }),
  });
  const setB = (patch: Partial<typeof pr.brief>) => savePreferences({ ...pr, brief: { ...pr.brief, ...patch } }).catch((e) => toast.error(e.message));
  return (
    <div>
      <PageTitle eyebrow="Every week" title="Weekly brief" sub={`${b.period.start} – ${b.period.end}${viewing ? ` · saved ${new Date(viewing.generatedAt).toLocaleString()}` : ""}`} />
      {viewing && <Button size="sm" variant="ghost" className="mb-2" onClick={() => setViewing(null)}>← Back to this week</Button>}
      <div className="mb-4 flex flex-wrap gap-2"><Button variant="gold" onClick={() => generate()}>Generate & save</Button><Button variant="outline" onClick={pdf}>PDF</Button><Button variant="outline" onClick={share}>Share</Button></div>
      <Card title="A. Snapshot">
        <Row label="Spent" value={money(b.snapshot.spent)} strong />
        <Row label="Income" value={money(b.snapshot.income)} />
        <Row label="Net cash movement" value={money(b.snapshot.net)} tone={b.snapshot.net >= 0 ? "good" : "bad"} />
        <Row label="vs previous week" value={b.snapshot.change === null ? "—" : `${b.snapshot.change > 0 ? "+" : ""}${b.snapshot.change}%`} />
      </Card>
      <Card title="B. Spending highlights">
        {b.highlights.topCategory ? <Row label={`Top category: ${b.highlights.topCategory.category}`} value={money(b.highlights.topCategory.amount)} /> : <p className="text-sm text-muted-foreground">No spending this week.</p>}
        {b.highlights.unusual && <p className="py-1 text-sm font-semibold">{b.highlights.unusual}</p>}
        {b.highlights.significant.map((t) => <Row key={t.id} label={`${t.date.slice(5)} · ${t.title}`} value={money(t.amount)} />)}
      </Card>
      <Card title="C. Next seven days">
        <Row label="Payments due" value={money(b.upcoming.dueTotal)} />
        {b.upcoming.due.map((u, k) => <Row key={k} label={`${u.date.slice(5)} · ${u.name}`} value={money(u.amount)} />)}
        <Row label="Expected income" value={money(b.upcoming.incomeTotal)} />
        {b.upcoming.shortfall && <p className="mt-1 text-sm font-semibold text-destructive">Possible shortfall — lowest projected {money(b.upcoming.lowest)}</p>}
      </Card>
      <Card title="D. Needs attention">
        <Row label="Outdated accounts" value={b.attention.staleAccounts.join(", ") || "None"} />
        <Row label="Pending reimbursements" value={money(b.attention.pendingReimbursements)} />
        <Row label="Open inbox items" value={b.attention.missingItems} />
        <Row label="Budget warnings" value={b.attention.budgetWarnings.join(", ") || "None"} />
      </Card>
      <Card title="E. Top recommendations">
        {b.recommendations.length ? <ol className="list-decimal space-y-1 pl-5 text-sm">{b.recommendations.map((r) => <li key={r}>{r}</li>)}</ol> : <p className="text-sm text-muted-foreground">Nothing urgent this week.</p>}
        <p className="mt-2 text-[11px] text-muted-foreground">Rule-based from verified figures, at most three.</p>
      </Card>
      <Card title="Schedule">
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={pr.brief.enabled} onChange={(e) => setB({ enabled: e.target.checked })} /> Prepare automatically each week</label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div><Label>Day</Label><select className={fieldCls} value={pr.brief.day} onChange={(e) => setB({ day: Number(e.target.value) })}>{DAYS.map((d, k) => <option key={d} value={k}>{d}</option>)}</select></div>
          <div><Label>Time</Label><select className={fieldCls} value={pr.brief.hour} onChange={(e) => setB({ hour: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</select></div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">The brief is prepared the first time you open the app after this time. It isn't sent in the background.</p>
      </Card>
      <Card title={`Previous briefs (${pr.briefs.length})`}>
        {pr.briefs.length === 0 ? <p className="text-sm text-muted-foreground">None saved yet.</p> : pr.briefs.map((x) => <button key={x.id} className="flex w-full justify-between border-b py-2 text-left text-sm last:border-0" onClick={() => { setViewing(x); window.scrollTo(0, 0); }}><span>{x.data.period.start} – {x.data.period.end}</span><span className="font-mono font-semibold">{money(x.data.snapshot.spent)}</span></button>)}
      </Card>
    </div>
  );
}
