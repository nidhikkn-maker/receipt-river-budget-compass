import { ImportRules } from "@/components/ImportRules";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useStore } from "@/lib/store";
import { usePosition, todayISO } from "@/lib/use-position";
import { paymentReadiness } from "@/lib/readiness";
import { evaluateRules, validateRule, RULE_TEMPLATES, RULE_TRIGGERS, TRIGGER_LABEL, type FinanceRule, type RuleTrigger } from "@/lib/rules-engine";
import { Bell, BellOff, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/rules")({
  head: () => ({
    meta: [
      { title: "Financial rules — Ledgerline" },
      { name: "description", content: "Build your own money-monitoring rules: spending limits, large transactions, duplicate payments, reserve and card-use alerts." },
      { property: "og:title", content: "Financial rules — Ledgerline" },
      { property: "og:description", content: "Build your own money-monitoring rules without programming." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RulesPage,
});

const PRIORITY_TONE: Record<string, string> = { high: "text-destructive", medium: "text-gold-strong", low: "text-muted-foreground" };

function RulesPage() {
  const { preferences, savePreferences, transactions, accounts, commitments, goals } = useStore();
  const pos = usePosition(45);
  const today = todayISO();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Omit<FinanceRule, "id">>({ name: "", trigger: "category_spend", threshold: 20000, category: null, accountId: null, frequency: "daily", priority: "medium", notify: true, enabled: true });

  const readiness = useMemo(() => paymentReadiness({ commitments, accounts, transactions, today, horizonDays: 45 }), [commitments, accounts, transactions, today]);
  const events = useMemo(() => evaluateRules(preferences.rules, {
    transactions, accounts, commitments,
    reserves: goals.filter((g) => g.reserve).map((g) => ({ name: g.name, target: g.target, saved: g.saved })),
    cardUtilisation: pos.cards.map((c) => ({ accountId: c.id, name: c.name, pct: c.utilisation ?? 0 })),
    recurringIncreases: pos.subscriptions.summary.increases,
    readiness, today,
  }).filter((e) => !preferences.ruleDismissed.includes(`${e.ruleId}|${e.message}`)), [preferences.rules, preferences.ruleDismissed, transactions, accounts, commitments, goals, pos, readiness, today]);

  const save = async (rules: FinanceRule[]) => { await savePreferences({ ...preferences, rules }); };
  const addTemplate = async (t: Omit<FinanceRule, "id">) => {
    if (preferences.rules.some((r) => r.name === t.name)) { toast.message("That rule is already added"); return; }
    await save([...preferences.rules, { ...t, id: crypto.randomUUID() }]);
    toast.success(`Rule “${t.name}” added`);
  };
  const addCustom = async () => {
    try {
      validateRule(draft);
      await save([...preferences.rules, { ...draft, id: crypto.randomUUID() }]);
      setAdding(false);
      setDraft({ name: "", trigger: "category_spend", threshold: 20000, category: null, accountId: null, frequency: "daily", priority: "medium", notify: true, enabled: true });
      toast.success("Rule added");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Check the rule"); }
  };
  const dismiss = async (key: string) => { await savePreferences({ ...preferences, ruleDismissed: [...preferences.ruleDismissed, key] }); };

  const activeCategories = preferences.categories.filter((c) => !c.archived).map((c) => c.name);

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle eyebrow="Activity" title="Financial rules" sub="Your own monitoring rules — no programming. They check your records and alert you only when their condition is truly met." />

      <section className="mb-6 rounded-3xl border bg-card p-5">
        <h2 className="mb-2 font-display text-lg font-bold">Triggered now</h2>
        {!events.length && <p className="text-sm text-muted-foreground">Nothing triggered. Your rules are quiet — that's good news.</p>}
        <ul className="divide-y">
          {events.map((e) => {
            const key = `${e.ruleId}|${e.message}`;
            return (
              <li key={key} className="flex items-start justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <Link to={e.to} className={"font-semibold " + PRIORITY_TONE[e.priority]}>{e.message}</Link>
                  <span className="block text-xs text-muted-foreground">{e.ruleName} · {e.priority} priority</span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => void dismiss(key)}>Dismiss</Button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mb-6 rounded-3xl border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">Your rules</h2>
          <Button size="sm" variant="gold" onClick={() => setAdding((a) => !a)}><Plus className="mr-1 h-4 w-4" />New rule</Button>
        </div>
        {!preferences.rules.length && <p className="text-sm text-muted-foreground">No rules yet. Add a template below or create your own.</p>}
        <ul className="divide-y">
          {preferences.rules.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
              <Switch checked={r.enabled} onCheckedChange={(v) => void save(preferences.rules.map((x) => (x.id === r.id ? { ...x, enabled: v } : x)))} aria-label={`Enable ${r.name}`} />
              <div className="min-w-0 flex-1">
                <span className="font-semibold">{r.name}</span>
                <span className="block text-xs text-muted-foreground">{TRIGGER_LABEL[r.trigger]}{r.threshold ? ` · ${r.trigger === "card_utilisation" ? `${r.threshold}%` : r.trigger === "unverified_old" || r.trigger === "duplicate_merchant" ? `${r.threshold} days` : `₹${r.threshold.toLocaleString("en-IN")}`}` : ""}{r.category ? ` · ${r.category}` : ""} · checks {r.frequency}</span>
              </div>
              <Button size="icon" variant="ghost" aria-label={r.notify ? "Notifications on" : "Notifications off"} onClick={() => void save(preferences.rules.map((x) => (x.id === r.id ? { ...x, notify: !x.notify } : x)))}>
                {r.notify ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
              </Button>
              <Button size="icon" variant="ghost" aria-label={`Delete ${r.name}`} onClick={() => void save(preferences.rules.filter((x) => x.id !== r.id))}><Trash2 className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>

        {adding && (
          <div className="mt-4 grid gap-3 rounded-2xl border bg-secondary/40 p-4">
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Rule name" aria-label="Rule name" />
            <div className="grid gap-3 sm:grid-cols-2">
              <select value={draft.trigger} onChange={(e) => setDraft({ ...draft, trigger: e.target.value as RuleTrigger })} className="h-10 rounded-md border bg-background px-3 text-sm" aria-label="Condition">
                {RULE_TRIGGERS.map((t) => <option key={t} value={t}>{TRIGGER_LABEL[t]}</option>)}
              </select>
              <Input value={String(draft.threshold)} onChange={(e) => setDraft({ ...draft, threshold: Number(e.target.value) || 0 })} inputMode="decimal" placeholder="Threshold" aria-label="Threshold" />
              {draft.trigger === "category_spend" && (
                <select value={draft.category ?? ""} onChange={(e) => setDraft({ ...draft, category: e.target.value || null })} className="h-10 rounded-md border bg-background px-3 text-sm" aria-label="Category">
                  <option value="">Pick category…</option>
                  {activeCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              <select value={draft.accountId ?? ""} onChange={(e) => setDraft({ ...draft, accountId: e.target.value || null })} className="h-10 rounded-md border bg-background px-3 text-sm" aria-label="Account (optional)">
                <option value="">All accounts</option>
                {accounts.filter((a) => !a.archived).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <select value={draft.frequency} onChange={(e) => setDraft({ ...draft, frequency: e.target.value as FinanceRule["frequency"] })} className="h-10 rounded-md border bg-background px-3 text-sm" aria-label="How often it checks">
                <option value="daily">Check daily</option><option value="weekly">Check weekly</option><option value="monthly">Check monthly</option>
              </select>
              <select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as FinanceRule["priority"] })} className="h-10 rounded-md border bg-background px-3 text-sm" aria-label="Priority">
                <option value="high">High priority</option><option value="medium">Medium priority</option><option value="low">Low priority</option>
              </select>
            </div>
            <div className="flex gap-2">
              <Button variant="gold" onClick={() => void addCustom()}>Add rule</Button>
              <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-3xl border bg-card p-5">
        <h2 className="mb-3 font-display text-lg font-bold">Ready-made templates</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {RULE_TEMPLATES.map((t) => (
            <li key={t.name} className="flex items-center justify-between gap-2 rounded-2xl border p-3 text-sm">
              <span className="min-w-0"><span className="font-semibold">{t.name}</span><span className="block text-xs text-muted-foreground">{TRIGGER_LABEL[t.trigger]}</span></span>
              <Button size="sm" variant="outline" onClick={() => void addTemplate(t)}>Add</Button>
            </li>
          ))}
        </ul>
      </section>
      <section id="classification" className="mt-6 rounded-3xl border bg-card p-5" aria-label="Transaction classification rules">
        <h2 className="mb-2 font-display text-lg font-semibold">Transaction classification rules</h2>
        <ImportRules />
      </section>
    </div>
  );
}
