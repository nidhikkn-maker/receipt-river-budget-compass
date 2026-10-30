import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES, createExpense, type Category, type Receipt } from "@/lib/expenses";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/new")({
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
  new Promise<Receipt>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res({ name: f.name, type: f.type, dataUrl: r.result as string });
    r.onerror = rej;
    r.readAsDataURL(f);
  });

function NewExpense() {
  const { user, upsert } = useStore();
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<Category>("Travel");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [receipts, setReceipts] = useState<Receipt[]>([]);

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    const big = Array.from(files).find((f) => f.size > 2 * 1024 * 1024);
    if (big) { toast.error(`${big.name} is larger than 2 MB`); return; }
    const read = await Promise.all(Array.from(files).map(readFile));
    setReceipts((r) => [...r, ...read]);
  };

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!title.trim()) { toast.error("Add a title"); return; }
    try {
      upsert(createExpense(user, { title: title.trim(), amount: Number(amount), category, date, description, receipts }));
      toast.success("Submitted to your department manager");
      nav({ to: "/" });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <>
      <PageTitle title="Submit an expense" sub={`Routes to the ${user.department} manager, then Finance.`} />
      <form onSubmit={submit} className="grid max-w-2xl gap-5 rounded-md border bg-card p-6">
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
        <div className="grid gap-2">
          <Label htmlFor="r">Receipts (images or PDF, max 2 MB each)</Label>
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
        <div className="flex justify-end"><Button type="submit">Submit for approval</Button></div>
      </form>
    </>
  );
}
