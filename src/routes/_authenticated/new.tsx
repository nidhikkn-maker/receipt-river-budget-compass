import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES, type Category } from "@/lib/expenses";

type LocalReceipt = { file: File; name: string; type: string; dataUrl: string };
import { useStore } from "@/lib/store";
import { extractReceipt } from "@/lib/receipt-extract.functions";

export const Route = createFileRoute("/_authenticated/new")({
  head: () => ({
    meta: [
      { title: "Submit an expense — Ledgerline" },
      { name: "description", content: "Submit a business expense with receipts for approval." },
      { property: "og:title", content: "Submit an expense — Ledgerline" },
      { property: "og:description", content: "Submit a business expense with receipts for approval." },
    ],
  }),
  component: NewExpense,
});

const readFile = (f: File) =>
  new Promise<LocalReceipt>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res({ file: f, name: f.name, type: f.type, dataUrl: r.result as string });
    r.onerror = rej;
    r.readAsDataURL(f);
  });

function NewExpense() {
  const { user, submit: submitExpense } = useStore();
  const [saving, setSaving] = useState(false);
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<Category>("Travel");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [receipts, setReceipts] = useState<LocalReceipt[]>([]);

  const [reading, setReading] = useState(false);
  const [merchant, setMerchant] = useState("");
  const [scan, setScan] = useState<{ merchant: string; date: string; amount: string } | null>(null);
  const [confirmed, setConfirmed] = useState(true);
  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    const big = Array.from(files).find((f) => f.size > 2 * 1024 * 1024);
    if (big) { toast.error(`${big.name} is larger than 2 MB`); return; }
    const read = await Promise.all(Array.from(files).map(readFile));
    setReceipts((r) => [...r, ...read]);
    const first = read[0];
    if (!first) return;
    setReading(true);
    try {
      const res = await extractReceipt({ data: { dataUrl: first.dataUrl, mimeType: first.type } });
      if (!res.ok) { toast.error(res.error); return; }
      const x = res.result;
      setScan({
        merchant: x.merchant ?? "",
        date: x.date && /^\d{4}-\d{2}-\d{2}$/.test(x.date) ? x.date : date,
        amount: x.amount != null ? String(x.amount) : "",
      });
      setConfirmed(false);
      if (x.category) setCategory(x.category);
      toast.success("Receipt read — please review the details");
    } catch {
      toast.error("Receipt reading failed");
    } finally {
      setReading(false);
    }
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!confirmed) { toast.error("Confirm the scanned receipt details first"); return; }
    if (!title.trim()) { toast.error("Add a title"); return; }
    try {
      setSaving(true);
      await submitExpense({ title: title.trim(), amount: Number(amount), category, date, description, merchant: merchant || null }, receipts.map((r) => r.file));
      toast.success("Submitted to your department manager");
      nav({ to: "/dashboard" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const confirmScan = () => {
    if (!scan) return;
    if (!scan.merchant.trim()) { toast.error("Enter the merchant"); return; }
    if (!(Number(scan.amount) > 0)) { toast.error("Enter an amount greater than zero"); return; }
    if (!scan.date) { toast.error("Enter the date"); return; }
    setMerchant(scan.merchant.trim());
    if (!title.trim()) setTitle(scan.merchant.trim());
    setAmount(scan.amount);
    setDate(scan.date);
    setConfirmed(true);
    toast.success("Receipt details confirmed");
  };

  return (
    <>
      <PageTitle title="Submit an expense" sub={`Routes to the ${user.department} manager, then Finance.`} />
      <form onSubmit={submit} className="grid max-w-2xl gap-5 rounded-md border bg-card p-6">
        <div className="grid gap-2">
          <Label htmlFor="r">Receipt — we'll read the merchant, date and amount for you</Label>
          {reading && <p className="text-sm text-muted-foreground animate-pulse">Reading receipt…</p>}
          {scan && !reading && !confirmed && (
            <div className="space-y-3 rounded-md border border-accent bg-accent/20 p-4" role="group" aria-label="Review scanned details">
              <div>
                <div className="text-sm font-medium">Review scanned details</div>
                <p className="text-xs text-muted-foreground">We read these from your receipt. Correct anything that's wrong, then confirm.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="grid gap-1"><Label htmlFor="sm">Merchant</Label><Input id="sm" value={scan.merchant} onChange={(e) => setScan({ ...scan, merchant: e.target.value })} /></div>
                <div className="grid gap-1"><Label htmlFor="sd">Date</Label><Input id="sd" type="date" value={scan.date} onChange={(e) => setScan({ ...scan, date: e.target.value })} /></div>
                <div className="grid gap-1"><Label htmlFor="sa">Amount (USD)</Label><Input id="sa" type="number" step="0.01" min="0" className="font-mono" value={scan.amount} onChange={(e) => setScan({ ...scan, amount: e.target.value })} /></div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => { setScan(null); setConfirmed(true); }}>Discard scan</Button>
                <Button type="button" size="sm" onClick={confirmScan}>Confirm details</Button>
              </div>
            </div>
          )}
          {merchant && confirmed && !reading && <p className="text-xs text-muted-foreground">Confirmed merchant: <span className="font-medium text-foreground">{merchant}</span></p>}
          <Input id="r" type="file" multiple accept="image/*,application/pdf" onChange={(e) => onFiles(e.target.files)} />
          {receipts.length > 0 && (
            <ul className="flex flex-wrap gap-2 text-xs">
              {receipts.map((r, i) => (
                <li key={i} className="flex items-center gap-2 rounded border bg-muted px-2 py-1">
                  {r.name}
                  <button type="button" className="text-destructive" onClick={() => setReceipts((x) => x.filter((_, j) => j !== i))}>×</button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="grid gap-2"><Label htmlFor="t">Title</Label><Input id="t" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Client lunch – Acme" /></div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2"><Label htmlFor="a">Amount (USD)</Label><Input id="a" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="font-mono" /></div>
          <div className="grid gap-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-2"><Label htmlFor="d">Date</Label><Input id="d" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        </div>
        <div className="grid gap-2"><Label htmlFor="desc">Business purpose</Label><Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div className="flex justify-end"><Button type="submit" disabled={reading || saving || !confirmed}>Submit for approval</Button></div>
      </form>
    </>
  );
}
