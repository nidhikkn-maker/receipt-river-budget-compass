import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { toast } from "sonner";
import { shopKey, smartDefaults, type ShopRuleField } from "@/lib/entry-form";
import { ACTIVE_SCOPES, PAYMENT_LABEL, PAYMENT_METHODS, SCOPE_LABEL } from "@/lib/expenses";
import type { ShopRule } from "@/lib/preferences";

const LEARN = "__learn";

/** Per-shop corrections: keep learning, turn a suggestion off, or always use a chosen value. */
export function ShopRulesSettings() {
  const { preferences: p, savePreferences, transactions, accounts } = useStore();
  const [q, setQ] = useState("");
  const rules = p.shopRules ?? {};
  const live = accounts.filter((a) => !a.archived);
  const cats = p.categories.filter((c) => !c.archived).map((c) => c.name);
  const shops = useMemo(() => {
    const m = new Map<string, { name: string; n: number }>();
    for (const e of transactions) { if ((e.txnType ?? "expense") !== "expense" || !e.merchant?.trim()) continue; const k = shopKey(e.merchant); const x = m.get(k); m.set(k, { name: x?.name ?? e.merchant.trim(), n: (x?.n ?? 0) + 1 }); }
    return [...m.entries()].sort((a, b) => Number(Boolean(rules[b[0]])) - Number(Boolean(rules[a[0]])) || b[1].n - a[1].n);
  }, [transactions, rules]);
  const shown = shops.filter(([k]) => !q.trim() || k.includes(shopKey(q))).slice(0, q.trim() ? 30 : 8);
  const setRule = async (key: string, f: ShopRuleField, v: string) => {
    const next: ShopRule = { ...(rules[key] ?? {}) };
    if (v === LEARN) delete next[f]; else next[f] = v;
    const all = { ...rules }; if (Object.keys(next).length) all[key] = next; else delete all[key];
    try { await savePreferences({ ...p, shopRules: all }); } catch { toast.error("Couldn't save — try again"); }
  };
  const field = (key: string, f: ShopRuleField, label: string, learned: string | null, options: { value: string; label: string }[]) => (
    <Select value={rules[key]?.[f] ?? LEARN} onValueChange={(v) => void setRule(key, f, v)}>
      <SelectTrigger aria-label={`${label} for ${key}`} className="h-8 w-full min-w-0 text-xs [&>span]:truncate"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={LEARN}>{label}: learned{learned ? ` (${learned})` : ""}</SelectItem>
        <SelectItem value="off">{label}: don't suggest</SelectItem>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{label}: always {o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 border-t pt-3">
      <div><h3 className="text-sm font-medium">Per-shop rules</h3><p className="text-xs text-muted-foreground">Correct or switch off what's learned for a specific shop. Your saved entries are not changed.</p></div>
      <Input placeholder="Search your shops" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search shops" />
      {shown.length === 0 && <p className="text-xs text-muted-foreground">No shops found yet — they appear after you save expenses with a shop name.</p>}
      {shown.map(([key, s]) => {
        const d = smartDefaults(transactions, live.map((a) => a.id), { merchant: s.name, scopes: ACTIVE_SCOPES, categories: cats });
        return (
          <div key={key} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{s.name} <span className="text-xs text-muted-foreground">· {s.n} expenses</span></span>{rules[key] && <Button size="sm" variant="ghost" onClick={() => { const all = { ...rules }; delete all[key]; void savePreferences({ ...p, shopRules: all }); }}>Reset</Button>}</div>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
              {field(key, "category", "Category", d.category, cats.map((c) => ({ value: c, label: c })))}
              {field(key, "accountId", "Account", live.find((a) => a.id === d.accountId)?.name ?? null, live.map((a) => ({ value: a.id, label: a.name })))}
              {field(key, "paymentMethod", "Payment", d.paymentMethod ? PAYMENT_LABEL[d.paymentMethod as keyof typeof PAYMENT_LABEL] ?? d.paymentMethod : null, PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_LABEL[m] })))}
              {field(key, "scope", "Workspace", d.scope ? SCOPE_LABEL[d.scope] : null, ACTIVE_SCOPES.map((x) => ({ value: x, label: SCOPE_LABEL[x] })))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
