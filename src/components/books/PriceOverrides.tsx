/** Manual prices with source, date and change history while the licensed feed is pending. */
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { quoteKey } from "@/lib/books/market";
import { clearOverride, setOverride, validateOverride } from "@/lib/books/price-overrides";
import type { BooksData } from "@/lib/books/types";

interface Item { key: string; name: string }
const today = () => new Date().toISOString().slice(0, 10);

export function PriceOverrides({ books, save, demat }: { books: BooksData; save: (p: Partial<BooksData>) => Promise<unknown>; demat: { isin: string; name?: string | null }[] }) {
  const list = books.priceOverrides ?? [];
  const items: Item[] = [];
  for (const h of books.holdings) { const k = quoteKey(h); if (k && h.kind !== "physical_gold" && !items.some((i) => i.key === k)) items.push({ key: k, name: h.name }); }
  for (const h of demat) { const k = `isin:${h.isin}`; if (!items.some((i) => i.key === k)) items.push({ key: k, name: h.name ?? h.isin }); }
  const [form, setForm] = useState<{ key: string; price: string; priceDate: string; source: string; note: string } | null>(null);

  const submit = async () => {
    if (!form) return;
    const item = items.find((i) => i.key === form.key);
    const input = { key: form.key, name: item?.name ?? form.key, price: Number(form.price), priceDate: form.priceDate, source: form.source, note: form.note };
    const err = validateOverride(input, today());
    if (err) { toast.error(err); return; }
    await save({ priceOverrides: setOverride(list, input, new Date().toISOString()) });
    toast.success("Manual price saved — it is used until you clear it");
    setForm(null);
  };

  return (
    <details className="rounded-xl border p-3 text-xs" open={list.some((o) => o.active) || undefined}>
      <summary className="cursor-pointer font-medium">Manual prices ({list.filter((o) => o.active).length} active)</summary>
      <p className="mt-1 text-muted-foreground">Use while the licensed price feed is pending. A manual price replaces any other price for that holding until you clear it, and every change is kept.</p>
      {items.length === 0 && <p className="mt-2 text-muted-foreground">Add a holding with an ISIN, exchange symbol or scheme code first.</p>}
      <div className="mt-2 divide-y">
        {items.map((i) => {
          const o = list.find((x) => x.key === i.key);
          return <div key={i.key} className="py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0">{i.name}<span className="block text-muted-foreground">{o?.active ? `₹${o.price} on ${o.priceDate} · ${o.source}` : "No manual price"}</span></span>
              <span className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => setForm({ key: i.key, price: o?.active ? String(o.price) : "", priceDate: o?.active ? o.priceDate : today(), source: o?.active ? o.source : "", note: "" })}>{o?.active ? "Edit" : "Set price"}</Button>
                {o?.active && <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { await save({ priceOverrides: clearOverride(list, i.key, new Date().toISOString()) }); toast.success("Manual price cleared"); }}>Clear</Button>}
              </span>
            </div>
            {form?.key === i.key && <div className="mt-2 grid grid-cols-2 gap-2">
              <Input aria-label="Manual price" type="number" placeholder="Price per unit" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              <Input aria-label="Price date" type="date" max={today()} value={form.priceDate} onChange={(e) => setForm({ ...form, priceDate: e.target.value })} />
              <Input aria-label="Price source" className="col-span-2" placeholder="Source (e.g. NSE website, broker contract note)" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
              <Input aria-label="Note" className="col-span-2" placeholder="Note (optional)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              <div className="col-span-2 flex gap-2"><Button size="sm" onClick={submit}>Save price</Button><Button size="sm" variant="ghost" onClick={() => setForm(null)}>Cancel</Button></div>
            </div>}
            {o && o.history.length > 0 && <details className="mt-1"><summary className="cursor-pointer text-muted-foreground">Change history ({o.history.length})</summary>
              <ul className="mt-1 space-y-0.5">{[...o.history].reverse().map((h, n) => <li key={n}>{h.at.slice(0, 16).replace("T", " ")} UTC · {h.action} · ₹{h.price} for {h.priceDate} · {h.source}{h.note ? ` · ${h.note}` : ""}</li>)}</ul></details>}
          </div>;
        })}
      </div>
    </details>
  );
}
