/** Per-year tax facts for one company: add / edit / copy / delete; every field optional. */
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { emptyBooks } from "@/lib/books/types";
import { fyOf, type EntityProfile } from "@/lib/entities";
import { confirmAction } from "@/lib/confirm";
import { copyTaxYear, removeTaxYear, upsertTaxYear, type EntityTaxYear } from "@/lib/books/entity-tax-profile";

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const toNum = (s: string) => (s.trim() === "" ? null : Number(s));
type Draft = { id: string; fy: string; ownershipPct: string; capital: string; accumulatedProfits: string; bookProfit: string; notes: string };

export function CompanyTaxProfile({ entity }: { entity: EntityProfile }) {
  const { preferences, savePreferences } = useStore();
  const books = preferences.books ?? emptyBooks();
  const all = books.entityTaxProfiles ?? [];
  const years = all.filter((x) => x.entityId === entity.id).sort((a, b) => b.fy.localeCompare(a.fy));
  const [d, setD] = useState<Draft | null>(null);
  const firm = entity.kind === "partnership" || entity.kind === "llp";
  const persist = async (list: EntityTaxYear[], msg: string) => { await savePreferences({ ...preferences, books: { ...books, entityTaxProfiles: list } }); toast.success(msg); };
  const startNew = () => setD({ id: crypto.randomUUID(), fy: fyOf(new Date().toISOString().slice(0, 10)), ownershipPct: "", capital: "", accumulatedProfits: "", bookProfit: "", notes: "" });
  const startEdit = (y: EntityTaxYear) => setD({ id: y.id, fy: y.fy, ownershipPct: y.ownershipPct?.toString() ?? "", capital: y.capital?.toString() ?? "", accumulatedProfits: y.accumulatedProfits?.toString() ?? "", bookProfit: y.bookProfit?.toString() ?? "", notes: y.notes ?? "" });
  const submit = async () => {
    if (!d) return;
    if (!/^\d{4}-\d{2}$/.test(d.fy)) { toast.error("Tax year looks like 2025-26"); return; }
    const pct = toNum(d.ownershipPct);
    if (pct != null && (pct < 0 || pct > 100)) { toast.error("Ownership share is between 0 and 100"); return; }
    await persist(upsertTaxYear(all, { id: d.id, entityId: entity.id, fy: d.fy, ownershipPct: pct, capital: toNum(d.capital), accumulatedProfits: toNum(d.accumulatedProfits), bookProfit: toNum(d.bookProfit), notes: d.notes }), `Tax profile for FY ${d.fy} saved`);
    setD(null);
  };
  const copy = async (y: EntityTaxYear) => {
    const n = Number(y.fy.slice(0, 4)) + 1; const to = `${n}-${String((n + 1) % 100).padStart(2, "0")}`;
    if (years.some((x) => x.fy === to) && !(await confirmAction({ title: `Replace FY ${to}?`, message: "That year already has a tax profile.", confirmLabel: "Replace" }))) return;
    await persist(copyTaxYear(all, y.id, to, crypto.randomUUID()), `Copied to FY ${to}`);
  };
  const del = async (y: EntityTaxYear) => { if (await confirmAction({ title: `Delete FY ${y.fy} tax profile?`, message: "Tax working goes back to flagging these facts as unknown.", confirmLabel: "Delete" })) await persist(removeTaxYear(all, y.id), "Deleted"); };

  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-muted-foreground">Tax profile by year ({years.length})</p>
      {years.map((y) => <div key={y.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary/50 px-3 py-1.5 text-xs">
        <span className="min-w-0 break-words">FY {y.fy}{y.ownershipPct != null ? ` · share ${y.ownershipPct}%` : ""}{y.capital != null ? ` · capital ${inr(y.capital)}` : ""}{y.accumulatedProfits != null ? ` · past profits ${inr(y.accumulatedProfits)}` : ""}{y.bookProfit != null ? ` · book profit ${inr(y.bookProfit)}` : ""}</span>
        <span className="flex gap-1"><Button size="sm" variant="ghost" className="h-7" onClick={() => startEdit(y)}>Edit</Button><Button size="sm" variant="ghost" className="h-7" onClick={() => void copy(y)}>Copy to next year</Button><Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => void del(y)}>Delete</Button></span>
      </div>)}
      {d ? <div className="grid grid-cols-2 gap-2 rounded-xl border p-2 text-xs">
        <label>Tax year<Input value={d.fy} placeholder="2025-26" onChange={(e) => setD({ ...d, fy: e.target.value.trim() })} /></label>
        <label>Your share %<Input type="number" inputMode="decimal" value={d.ownershipPct} onChange={(e) => setD({ ...d, ownershipPct: e.target.value })} /></label>
        {firm && <label>Partner capital<Input type="number" inputMode="decimal" value={d.capital} onChange={(e) => setD({ ...d, capital: e.target.value })} /></label>}
        {entity.kind === "company" && <label>Past accumulated profits<Input type="number" inputMode="decimal" value={d.accumulatedProfits} onChange={(e) => setD({ ...d, accumulatedProfits: e.target.value })} /></label>}
        <label>Book profit (optional)<Input type="number" inputMode="decimal" value={d.bookProfit} onChange={(e) => setD({ ...d, bookProfit: e.target.value })} /></label>
        <label className="col-span-2">Notes<Input value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} /></label>
        <p className="col-span-2 text-[11px] text-muted-foreground">All fields are optional. Blank means unknown — tax working flags it instead of guessing.</p>
        <div className="col-span-2 flex gap-2"><Button size="sm" onClick={() => void submit()}>Save</Button><Button size="sm" variant="ghost" onClick={() => setD(null)}>Cancel</Button></div>
      </div> : <Button size="sm" variant="outline" onClick={startNew}>Add tax year</Button>}
    </div>
  );
}
