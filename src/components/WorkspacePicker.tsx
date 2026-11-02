import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { ScopeToggle } from "@/components/ScopeBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACTIVE_SCOPES, SCOPE_LABEL, type Scope } from "@/lib/expenses";
import { buildShares, validateShares, type AllocationMethod, type Suggestion, type WorkspaceShare } from "@/lib/workspaces";

/** Workspace choice with an editable suggestion and an optional split of one entry across workspaces (charged once). */
export function WorkspacePicker({ scope, setScope, suggestion, total, currency, split, setSplit, compact, row }: {
  scope: Scope; setScope: (s: Scope) => void; suggestion: Suggestion; total: number; currency: string;
  split: { on: boolean; method: AllocationMethod; values: Partial<Record<Scope, string>> }; setSplit: (s: { on: boolean; method: AllocationMethod; values: Partial<Record<Scope, string>> }) => void;
  compact?: boolean;
  /** Print the choice as a receipt row: label on the left, the chosen workspace on the right. */
  row?: boolean;
}) {
  const shares = useMemo(() => splitShares(split, total), [split, total]);
  const err = split.on ? validateShares(shares, total) : null;
  const tone = suggestion.confidence === "high" ? "text-primary" : "text-accent-foreground";
  const splitToggle = (
    <label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" checked={split.on} onChange={(e) => setSplit({ ...split, on: e.target.checked, values: e.target.checked && !Object.keys(split.values).length ? { [scope]: "" } : split.values })} />Split across workspaces</label>
  );
  const picker = split.on ? null : (row
    ? <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
        <SelectTrigger aria-label="Workspace" className="h-9 px-0 text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>{ACTIVE_SCOPES.map((w) => <SelectItem key={w} value={w}>{SCOPE_LABEL[w]}</SelectItem>)}</SelectContent>
      </Select>
    : compact
      ? <select aria-label="Workspace" value={scope} onChange={(e) => setScope(e.target.value as Scope)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm">{ACTIVE_SCOPES.map((w) => <option key={w} value={w}>{SCOPE_LABEL[w]}</option>)}</select>
      : <ScopeToggle value={scope} onChange={setScope} />);
  const suggestionNode = suggestion.workspace && suggestion.workspace !== scope && !split.on ? (
    <button type="button" onClick={() => setScope(suggestion.workspace!)} className={`flex items-center gap-1 text-left text-xs ${tone}`}>
      <Sparkles className="h-3 w-3" />Suggested: {SCOPE_LABEL[suggestion.workspace]} ({suggestion.confidence === "high" ? "confident" : "please check"}) — {suggestion.reason}. Tap to use.
    </button>
  ) : null;
  const reasonNode = suggestion.confidence === "none" && !split.on ? <p className="text-xs text-muted-foreground">{suggestion.reason}</p> : null;
  const splitPanel = split.on ? (
    <div className="grid gap-2 rounded-2xl border p-3">
      <div className="flex flex-wrap gap-1">{(["fixed", "percent", "equal"] as const).map((m) => <Button key={m} type="button" size="sm" variant={split.method === m ? "default" : "outline"} onClick={() => setSplit({ ...split, method: m })}>{m === "fixed" ? `Amount (${currency})` : m === "percent" ? "Percent" : "Equal"}</Button>)}</div>
      {ACTIVE_SCOPES.map((w) => {
        const on = w in split.values;
        return (
          <div key={w} className="flex items-center gap-2">
            <label className="flex w-28 items-center gap-2 text-sm"><input type="checkbox" checked={on} onChange={(e) => { const v = { ...split.values }; if (e.target.checked) v[w] = ""; else delete v[w]; setSplit({ ...split, values: v }); }} />{SCOPE_LABEL[w]}</label>
            {on && split.method !== "equal" && <Input type="number" inputMode="decimal" className="h-9" aria-label={`${SCOPE_LABEL[w]} share`} value={split.values[w] ?? ""} onChange={(e) => setSplit({ ...split, values: { ...split.values, [w]: e.target.value } })} />}
            {on && <span className="ml-auto text-xs text-muted-foreground">{shares.find((s) => s.workspace === w)?.amount ?? 0} {currency}</span>}
          </div>
        );
      })}
      <p className={`text-xs ${err ? "text-destructive" : "text-muted-foreground"}`}>{err ?? "Paid once from the chosen account; each workspace's reports use its share."}</p>
    </div>
  ) : null;

  if (row) {
    return (
      <div className="receipt-row">
        <Label>Workspace</Label>
        {picker ?? <span aria-hidden />}
        {splitToggle}
        {suggestionNode}
        {reasonNode}
        {splitPanel}
      </div>
    );
  }
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label>Workspace</Label>
        {splitToggle}
      </div>
      {picker}
      {suggestionNode}
      {reasonNode}
      {splitPanel}
    </div>
  );
}

export function splitShares(split: { on: boolean; method: AllocationMethod; values: Partial<Record<Scope, string>> }, total: number): WorkspaceShare[] {
  if (!split.on) return [];
  const parts = (Object.entries(split.values) as [Scope, string][]).map(([workspace, v]) => ({ workspace, value: Number(v) || 0 }));
  return buildShares(total, split.method, parts);
}
