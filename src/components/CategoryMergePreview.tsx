import { useState } from "react";
import { useStore } from "@/lib/store";
import { money } from "@/lib/expenses";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

export function CategoryMergePreview({ source, onClose }: { source: string; onClose: () => void }) {
  const store = useStore();
  const [target, setTarget] = useState("");
  const [error, setError] = useState("");
  const affected = store.transactions.filter(e => e.category === source || e.allocations?.some(a => a.category === source));
  const splitRefs = affected.filter(e => e.allocations?.some(a => a.category === source));
  const commitments = store.commitments.filter(c => c.category === source);
  const budgets = store.preferences.budgets.filter(b => b.kind === "category" && b.value === source);
  const monthly = store.budgets[source] ?? 0;
  const confirm = async () => {
    setError("");
    if (!target || splitRefs.length) return;
    try {
      await store.moveCategory(source, target);
      await store.savePreferences({ ...store.preferences, budgets: store.preferences.budgets.map(b => b.kind === "category" && b.value === source ? { ...b, value: target } : b), categories: store.preferences.categories.filter(c => c.name !== source) });
      onClose();
    } catch (e) { setError((e as Error).message); }
  };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent><DialogHeader><DialogTitle>Review category merge</DialogTitle></DialogHeader>
      <p className="text-sm">From {source}</p>
      <Select value={target} onValueChange={setTarget}><SelectTrigger aria-label="Merge into category"><SelectValue placeholder="Choose existing category" /></SelectTrigger><SelectContent>{store.preferences.categories.filter(c => c.name !== source).map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent></Select>
      <p className="text-sm">{affected.length} visible entries · {commitments.length} scheduled payments · {budgets.length} scoped budgets</p>
      <p className="text-sm">Monthly limit: {money(monthly)}{target ? ` + ${money(store.budgets[target] ?? 0)} in ${target}` : ""}</p>
      <ul className="max-h-60 overflow-auto divide-y">{affected.map(e => <li key={e.id} className="flex justify-between gap-3 py-2 text-sm"><span className="min-w-0 break-words">{e.date} · {e.title}{e.allocations?.some(a => a.category === source) ? " · split allocation" : ""}</span><span className="shrink-0 font-mono">{money(e.amount)}</span></li>)}</ul>
      {splitRefs.length > 0 && <p role="alert" className="text-sm text-destructive">This category is used in split allocations. Merge is unavailable until those references can be moved safely together.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">Amounts, receipts and statement sources are unchanged. Closed-period protection still applies.</p>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!target || splitRefs.length > 0} onClick={confirm}>Confirm merge</Button></div>
    </DialogContent>
  </Dialog>;
}