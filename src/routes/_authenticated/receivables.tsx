import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { receivableStatus, type Receivable } from "@/lib/receivables";

export const Route = createFileRoute("/_authenticated/receivables")({
  head: () => ({ meta: [
    { title: "Customers owing — Ledgerline" },
    { name: "description", content: "Track invoices customers owe you; payments are matched from your income entries." },
    { property: "og:title", content: "Customers owing — Ledgerline" },
    { property: "og:description", content: "Track invoices customers owe you; payments are matched from your income entries." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Receivables,
});

const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const today = () => new Date().toISOString().slice(0, 10);

function Receivables() {
  const { preferences, savePreferences, transactions } = useStore();
  const list = preferences.receivables ?? [];
  const [f, setF] = useState({ customer: "", invoiceNo: "", date: today(), dueDate: "", amount: "", gst: "" });
  const rows = useMemo(() => receivableStatus(list, transactions, today()), [list, transactions]);
  const open = rows.filter((x) => !x.paidBy);

  const add = async () => {
    const amount = Number(f.amount);
    if (!f.customer.trim() || !(amount > 0)) { toast.error("Add a customer and amount"); return; }
    const r: Receivable = { id: crypto.randomUUID(), customer: f.customer.trim(), date: f.date, amount, ...(f.invoiceNo.trim() ? { invoiceNo: f.invoiceNo.trim() } : {}), ...(f.dueDate ? { dueDate: f.dueDate } : {}), ...(Number(f.gst) > 0 && Number(f.gst) < amount ? { gst: Number(f.gst) } : {}) };
    await savePreferences({ ...preferences, receivables: [...list, r] });
    setF({ customer: "", invoiceNo: "", date: today(), dueDate: "", amount: "", gst: "" }); toast.success("Invoice added");
  };
  const remove = async (id: string) => savePreferences({ ...preferences, receivables: list.filter((x) => x.id !== id) });

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <PageTitle title="Customers owing" sub={`${open.length} unpaid · ${inr(open.reduce((s, x) => s + x.r.amount, 0))}`} />
      <div className="grid grid-cols-2 gap-2 rounded-2xl border bg-card p-3">
        <Input placeholder="Customer" value={f.customer} onChange={(e) => setF({ ...f, customer: e.target.value })} />
        <Input placeholder="Invoice no." value={f.invoiceNo} onChange={(e) => setF({ ...f, invoiceNo: e.target.value })} />
        <Input type="number" inputMode="decimal" placeholder="Amount ₹" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        <Input type="number" inputMode="decimal" placeholder="GST in it ₹" value={f.gst} onChange={(e) => setF({ ...f, gst: e.target.value })} />
        <Input type="date" aria-label="Invoice date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        <Input type="date" aria-label="Due date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
        <Button onClick={add}>Add invoice</Button>
      </div>
      <div className="divide-y rounded-2xl border bg-card">
        {rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">No invoices yet.</p>}
        {[...rows].reverse().map(({ r, paidBy, overdueDays }) => (
          <div key={r.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
            <div className="min-w-0">
              <div className="font-medium">{r.customer}{r.invoiceNo ? ` · ${r.invoiceNo}` : ""}</div>
              <div className={`text-xs ${!paidBy && overdueDays > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                {paidBy ? `Paid ${paidBy.date}` : overdueDays > 0 ? `${overdueDays} days overdue` : `Due ${r.dueDate ?? r.date}`}
              </div>
            </div>
            <div className="flex items-center gap-2"><b>{inr(r.amount)}</b><Button size="sm" variant="ghost" onClick={() => remove(r.id)}>Remove</Button></div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">An invoice counts as paid when an income entry of the same amount, on or after the invoice date, names the customer. Nothing is saved to your ledger from here.</p>
    </div>
  );
}
