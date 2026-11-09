import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore } from "@/lib/store";
import { COMPARE_FIELDS, compareValue, differingFields, markSeparate, type DuplicatePair } from "@/lib/duplicate-compare";
import { cn } from "@/lib/utils";

export function DuplicateList({ pairs }: { pairs: DuplicatePair[] }) {
  const [open, setOpen] = useState<DuplicatePair | null>(null);
  if (!pairs.length) return null;
  return <section aria-label="Possible duplicate pairs" className="space-y-2 rounded-2xl border p-3">
    <h3 className="text-sm font-semibold">{pairs.length} possible duplicate {pairs.length === 1 ? "pair" : "pairs"}</h3>
    <ul className="divide-y">{pairs.map(p => <li key={p.key} className="flex flex-wrap items-center justify-between gap-2 py-2"><div className="min-w-0 text-sm"><p className="break-words font-medium">{p.left.merchant || p.left.title} · {p.right.merchant || p.right.title}</p><p className="text-xs text-muted-foreground">{p.left.date} · {differingFields(p.left, p.right).length} differences</p></div><Button size="sm" variant="outline" onClick={() => setOpen(p)}>Compare</Button></li>)}</ul>
    {open && <DuplicateCompare pair={open} onClose={() => setOpen(null)} />}
  </section>;
}

export function DuplicateCompare({ pair, onClose }: { pair: DuplicatePair; onClose: () => void }) {
  const { accounts, preferences, savePreferences, remove } = useStore();
  const [removeSide, setRemoveSide] = useState<"left" | "right" | null>(null);
  const [ack, setAck] = useState(false);
  const diff = new Set(differingFields(pair.left, pair.right));
  const shown = (e: typeof pair.left, f: (typeof COMPARE_FIELDS)[number][0]) => f === "accountId" ? accounts.find(a => a.id === e.accountId)?.name ?? "None" : compareValue(e, f) || "—";
  const separate = async () => { await savePreferences({ ...preferences, inboxDismissed: markSeparate(preferences.inboxDismissed, pair.key) }); toast.success("Marked as separate transactions. This pair won't be flagged again."); onClose(); };
  const drop = async () => { const e = removeSide === "left" ? pair.left : pair.right; const kept = removeSide === "left" ? pair.right : pair.left; await remove(e, { reason: `Duplicate of entry ${kept.id} (kept), confirmed in the duplicate check` }); toast.success("Duplicate removed. The other entry is kept."); onClose(); };
  return <Dialog open onOpenChange={v => { if (!v) onClose(); }}><DialogContent className="max-h-[85dvh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-3xl">
    <DialogHeader><DialogTitle>Same transaction or two?</DialogTitle><DialogDescription>Differences are highlighted. Nothing changes until you choose.</DialogDescription></DialogHeader>
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="p-2">Field</th><th className="p-2">Entry A</th><th className="p-2">Entry B</th></tr></thead><tbody>{COMPARE_FIELDS.map(([f, label]) => <tr key={f} className={cn("border-b align-top", diff.has(f) && "bg-warning/10")}><th scope="row" className="p-2 text-xs font-medium text-muted-foreground">{label}{diff.has(f) && <span className="sr-only"> (differs)</span>}</th><td className="break-words p-2">{shown(pair.left, f)}</td><td className="break-words p-2">{shown(pair.right, f)}</td></tr>)}</tbody></table></div>
    {removeSide ? <div className="space-y-3 rounded-xl border border-destructive/40 p-3"><p className="text-sm font-medium">Remove entry {removeSide === "left" ? "A" : "B"} and keep the other?</p><p className="text-sm text-muted-foreground">The removed entry and its receipts are deleted from your account. This can't be undone.</p><label className="flex items-center gap-2 text-sm"><Checkbox checked={ack} onCheckedChange={v => setAck(v === true)} />I understand this entry will be deleted</label><div className="grid grid-cols-2 gap-2"><Button variant="ghost" onClick={() => { setRemoveSide(null); setAck(false); }}>Back</Button><Button variant="destructive" disabled={!ack} onClick={drop}>Remove it</Button></div></div>
      : <div className="grid gap-2 sm:grid-cols-3 [&_button]:min-h-11 [&_button]:whitespace-normal"><Button variant="outline" onClick={() => setRemoveSide("right")}>Same — keep A</Button><Button variant="outline" onClick={() => setRemoveSide("left")}>Same — keep B</Button><Button onClick={separate}>Separate transactions</Button></div>}
  </DialogContent></Dialog>;
}
