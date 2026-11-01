import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ExpenseDialog } from "@/components/ExpenseDialog";
import { useStore } from "@/lib/store";
import { money, type Expense } from "@/lib/expenses";
import { tripExpenses, selectMatching, type TripAction } from "@/lib/trip-actions";
import type { TravelTrip } from "@/lib/travel";
const LABELS = { link: "Link to this trip", unlink: "Remove from this trip", add_tag: "Add tag", organisation: "Assign organisation", reimbursable: "Mark reimbursable" };
export function TripExpenseActions({ trip }: { trip: TravelTrip }) {
  const { transactions, manageTripExpenses } = useStore();
  const [query, setQuery] = useState(""), [source, setSource] = useState(false);
  const [selected, setSelected] = useState<string[]>([]), [action, setAction] = useState<TripAction>("add_tag");
  const [value, setValue] = useState(""), [preview, setPreview] = useState<Expense[] | null>(null), [open, setOpen] = useState<Expense | null>(null);
  const linked = tripExpenses(trip, transactions);
  const candidates = transactions.filter((e) => (e.txnType ?? "expense") === "expense" && !e.tripId && !(e.tags ?? []).some((t) => t.startsWith("Trip: ")) && e.date >= trip.start && e.date <= trip.end);
  const filtered = (source ? candidates : linked).filter((e) => `${e.title} ${e.merchant ?? ""} ${e.date} ${e.category}`.toLowerCase().includes(query.toLowerCase()));
  const visible = filtered.slice(0, 40);
  const chosen = filtered.filter((e) => selected.includes(e.id));
  const locked = !!trip.closedAt || !!trip.cancelledAt;
  return <section className="mb-4" aria-label="Trip expense selection">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Trip expenses ({linked.length})</h2><Button asChild size="sm"><Link to="/new" search={{ trip: trip.id }}>Add expense</Link></Button></div>
    <div className="mb-3 flex flex-wrap gap-2"><Button size="sm" variant={!source ? "default" : "outline"} onClick={() => { setSource(false); setSelected([]); }}>Linked expenses</Button><Button size="sm" variant={source ? "default" : "outline"} onClick={() => { setSource(true); setSelected([]); }}>Link existing ({candidates.length})</Button></div>
    <Input aria-label="Filter trip expenses" placeholder="Merchant, date or category" value={query} onChange={(e) => { setQuery(e.target.value); setSelected([]); }} />
    {!locked && <div className="my-2 flex flex-wrap gap-1"><Button size="sm" variant="ghost" onClick={() => setSelected(selectMatching(selected, visible.map((e) => e.id)))}>Select visible ({visible.length})</Button><Button size="sm" variant="ghost" onClick={() => setSelected(filtered.map((e) => e.id))}>Select all matching ({filtered.length})</Button><Button size="sm" variant="ghost" onClick={() => setSelected([])}>Clear</Button></div>}
    <ul className="divide-y">{visible.map((e) => <li key={e.id} className={`flex min-h-16 items-center gap-3 py-2 ${selected.includes(e.id) ? "bg-secondary" : ""}`}>
      {!locked && <Checkbox aria-label={`Select ${e.title}`} checked={selected.includes(e.id)} onCheckedChange={(v) => setSelected(v ? selectMatching(selected, [e.id]) : selected.filter((id) => id !== e.id))} />}
      <Button variant="ghost" className="h-auto min-w-0 flex-1 justify-start p-0 text-left" onClick={() => setOpen(e)}><span className="min-w-0"><span className="block truncate font-medium">{e.merchant ?? e.title}</span><span className="block text-xs text-muted-foreground">{e.date} · {e.category}</span></span></Button>
      <span className="shrink-0 whitespace-nowrap text-sm font-semibold">{money(e.amount)}</span>
    </li>)}</ul>
    {filtered.length > visible.length && <p className="mt-2 text-xs text-muted-foreground">Showing {visible.length} of {filtered.length} matching expenses</p>}
    {!filtered.length && <p className="py-4 text-sm text-muted-foreground">No matching expenses</p>}
    {!!chosen.length && !locked && <div className="mt-3 space-y-2 border-y bg-background py-3" aria-label="Selected expense actions"><p className="text-sm font-semibold">{chosen.length} selected · {money(chosen.reduce((s, e) => s + e.amount, 0))}</p>
      <div className="flex flex-wrap gap-2">{source ? <Button size="sm" onClick={() => { setAction("link"); setPreview(chosen); }}>Link to trip</Button> : <>
        <select aria-label="Bulk expense action" className="h-10 max-w-full rounded-lg border bg-background px-2 text-sm" value={action} onChange={(e) => setAction(e.target.value as TripAction)}>{(["add_tag", "organisation", "reimbursable", "unlink"] as const).map((a) => <option key={a} value={a}>{LABELS[a]}</option>)}</select>
        {(action === "add_tag" || action === "organisation") && <Input className="min-w-0 flex-1" aria-label="Bulk action value" value={value} maxLength={120} onChange={(e) => setValue(e.target.value)} placeholder={action === "add_tag" ? "Tag" : "Organisation"} />}
        <Button size="sm" disabled={(action === "add_tag" || action === "organisation") && !value.trim()} onClick={() => setPreview(chosen)}>Review changes</Button>
      </>}
      <Button asChild size="sm" variant="outline"><Link to="/expenditure-statement" search={{ entries: chosen.map((e) => e.id).join(",") }}>Report selected</Link></Button></div>
    </div>}
    <Sheet open={!!preview} onOpenChange={(v) => { if (!v) setPreview(null); }}><SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto" aria-describedby={undefined}><SheetHeader><SheetTitle>Review {preview?.length ?? 0} expense changes</SheetTitle></SheetHeader><p className="my-3 text-sm">{LABELS[action]}{value && (action === "add_tag" || action === "organisation") ? `: ${value}` : ""}</p>
      {action === "reimbursable" && <p className="mb-3 text-sm text-muted-foreground">Adds the Reimbursable purpose tag. Existing claims and receipts stay unchanged.</p>}
      {action === "unlink" && <p className="mb-3 text-sm text-muted-foreground">Expenses stay in the ledger. Booking-linked payments must be unlinked from the booking first.</p>}
      <ul className="mb-4 divide-y">{preview?.map((e) => <li key={e.id} className="py-2 text-sm"><b>{e.title}</b><div className="break-words text-muted-foreground">{e.department || "No organisation"} · {(e.tags ?? []).join(", ") || "No tags"}</div></li>)}</ul>
      <Button className="w-full" onClick={async () => { if (!preview) return; try { const count = await manageTripExpenses(trip.id, preview, action, value.trim()); toast.success(`${count} expenses updated`); setPreview(null); setSelected([]); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't update expenses"); } }}>Apply to {preview?.length ?? 0} expenses</Button>
    </SheetContent></Sheet>
    <ExpenseDialog expense={open} onClose={() => setOpen(null)} />
  </section>;
}