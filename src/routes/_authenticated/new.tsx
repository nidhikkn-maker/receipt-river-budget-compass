import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ScopeToggle } from "@/components/ScopeBadge";
import { toast } from "sonner";
import { ScanLine, Sparkles, X } from "lucide-react";
import { PageTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BASE_CURRENCY, CATEGORIES, CURRENCIES, PAYMENT_LABEL, PAYMENT_METHODS, convert, money,
  type Category, type PaymentMethod, type Scope,
} from "@/lib/expenses";
import { useStore } from "@/lib/store";
import { extractReceipt } from "@/lib/receipt-extract.functions";
import { getFxRate } from "@/lib/fx.functions";
import { cn } from "@/lib/utils";

type LocalReceipt = { file: File; name: string; type: string; dataUrl: string };

export const Route = createFileRoute("/_authenticated/new")({
  validateSearch: (s: Record<string, unknown>): { edit?: string } => (typeof s["edit"] === "string" ? { edit: s["edit"] } : {}),
  head: () => ({
    meta: [
      { title: "Add expense — Ledgerline" },
      { name: "description", content: "Scan a bill in any currency and tag it business or personal." },
      { property: "og:title", content: "Add expense — Ledgerline" },
      { property: "og:description", content: "Scan a bill in any currency and tag it business or personal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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

const isDate = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

interface Scan { merchant: string; date: string; amount: string; currency: string }

function NewExpense() {
  const { save, expenses, members } = useStore();
  const nav = useNavigate();
  const { edit } = Route.useSearch();
  const editing = edit ? expenses.find((e) => e.id === edit) : undefined;
  const [scope, setScope] = useState<Scope>("personal");
  const [memberId, setMemberId] = useState<string>("me");
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<string>("INR");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("upi");
  const [category, setCategory] = useState<Category>("Groceries");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [receipts, setReceipts] = useState<LocalReceipt[]>([]);
  const [reading, setReading] = useState(false);
  const [scan, setScan] = useState<Scan | null>(null);
  const [confirmed, setConfirmed] = useState(true);
  const [autoFilled, setAutoFilled] = useState<Set<string>>(new Set());
  const [fx, setFx] = useState<{ rate: number; date: string } | { error: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    setTitle(editing.title); setMerchant(editing.merchant ?? ""); setAmount(String(editing.originalAmount)); setCurrency(editing.currency);
    setPaymentMethod(editing.paymentMethod); setCategory(editing.category); setDate(editing.date); setDescription(editing.description);
    setScope(editing.scope); setMemberId(editing.memberId ?? "me");
  }, [editing]);

  // Live rate for the bill date
  useEffect(() => {
    if (currency === BASE_CURRENCY) { setFx({ rate: 1, date }); return; }
    if (!isDate(date)) return;
    let live = true;
    setFx(null);
    getFxRate({ data: { currency, date } })
      .then((r) => live && setFx(r.ok ? { rate: r.rate, date: r.date } : { error: r.error }))
      .catch(() => live && setFx({ error: "Couldn't load the exchange rate" }));
    return () => { live = false; };
  }, [currency, date]);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const big = Array.from(files).find((f) => f.size > 5 * 1024 * 1024);
    if (big) { toast.error(`${big.name} is larger than 5 MB`); return; }
    const read = await Promise.all(Array.from(files).map(readFile));
    setReceipts((r) => [...r, ...read]);
    const first = read[0]!;
    setReading(true);
    try {
      const res = await extractReceipt({ data: { dataUrl: first.dataUrl, mimeType: first.type } });
      if (!res.ok) { toast.error(res.error); return; }
      const x = res.result;
      const filled = new Set<string>();
      if (x.title && !title) { setTitle(x.title); filled.add("title"); }
      if (x.category) { setCategory(x.category); filled.add("category"); }
      if (x.payment_method) { setPaymentMethod(x.payment_method); filled.add("payment"); }
      if (x.description && !description) { setDescription(x.description); filled.add("description"); }
      if (x.scope) { setScope(x.scope); filled.add("scope"); }
      const cur = x.currency && /^[A-Z]{3}$/.test(x.currency.toUpperCase()) ? x.currency.toUpperCase() : currency;
      setScan({ merchant: x.merchant ?? "", date: isDate(x.date) ? x.date : date, amount: x.amount != null ? String(x.amount) : "", currency: cur });
      setAutoFilled(filled);
      setConfirmed(false);
      toast.success("Bill read — check the key details");
    } catch {
      toast.error("Receipt reading failed");
    } finally {
      setReading(false);
    }
  };

  const confirmScan = () => {
    if (!scan) return;
    if (!scan.merchant.trim()) { toast.error("Enter the merchant"); return; }
    if (!(Number(scan.amount) > 0)) { toast.error("Enter an amount greater than zero"); return; }
    if (!isDate(scan.date)) { toast.error("Enter the date"); return; }
    setMerchant(scan.merchant.trim());
    if (!title.trim()) setTitle(scan.merchant.trim());
    setAmount(scan.amount);
    setDate(scan.date);
    setCurrency(scan.currency);
    setAutoFilled((s) => new Set([...s, "merchant", "amount", "date", "currency"]));
    setConfirmed(true);
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!confirmed) { toast.error("Confirm the scanned bill details first"); return; }
    setSaving(true);
    try {
      await save(
        { title: title.trim(), amount: Number(amount), currency, paymentMethod, category, date, description, merchant: merchant.trim() || null,
          scope, memberId: memberId === "me" ? null : memberId },
        { ...(editing ? { id: editing.id } : {}), files: receipts.map((r) => r.file) },
      );
      toast.success(editing ? "Expense updated" : "Expense saved");
      nav({ to: editing ? "/expenses" : "/dashboard" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const af = (k: string) => autoFilled.has(k) && <Sparkles className="ml-1 inline h-3 w-3 text-primary" aria-label="Auto-filled" />;
  const converted = fx && "rate" in fx && Number(amount) > 0 ? convert(Number(amount), fx.rate) : null;

  return (
    <>
      <PageTitle eyebrow={editing ? "Edit expense" : "New expense"} title={editing ? editing.title : "Scan a bill"} sub="Any currency — we convert to ₹ with that day's rate." />
      <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
        {/* Scan column */}
        <div className="space-y-4">
          <button type="button" onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-primary/40 bg-secondary/50 p-8 text-center transition hover:bg-secondary">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-hero text-primary-foreground shadow-float"><ScanLine className="h-7 w-7" /></span>
            <span className="font-display text-lg font-bold">{reading ? "Reading your bill…" : "Upload or snap a bill"}</span>
            <span className="text-xs text-muted-foreground">Photo or PDF · we fill in the rest</span>
          </button>
          <input ref={fileRef} id="r" type="file" multiple accept="image/*,application/pdf" capture="environment" className="sr-only" onChange={(e) => onFiles(e.target.files)} />
          {receipts.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {receipts.map((r, i) => (
                <li key={i} className="relative">
                  {r.type.startsWith("image/") ? <img src={r.dataUrl} alt={r.name} className="h-20 w-16 rounded-xl border object-cover" /> : <div className="flex h-20 w-16 items-center justify-center rounded-xl border bg-muted p-1 text-center text-[10px]">{r.name}</div>}
                  <button type="button" aria-label={`Remove ${r.name}`} onClick={() => setReceipts((x) => x.filter((_, j) => j !== i))} className="absolute -right-1.5 -top-1.5 rounded-full bg-ink p-0.5 text-ink-foreground"><X className="h-3 w-3" /></button>
                </li>
              ))}
            </ul>
          )}

          {scan && !reading && !confirmed && (
            <div className="space-y-3 rounded-3xl border-2 border-primary bg-card p-4 shadow-float" role="group" aria-label="Review scanned details">
              <div>
                <div className="font-display font-bold">Check what we read</div>
                <p className="text-xs text-muted-foreground">Fix anything that's off, then confirm.</p>
              </div>
              <div className="grid gap-1"><Label htmlFor="sm">Merchant</Label><Input id="sm" value={scan.merchant} onChange={(e) => setScan({ ...scan, merchant: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1"><Label htmlFor="sd">Date</Label><Input id="sd" type="date" value={scan.date} onChange={(e) => setScan({ ...scan, date: e.target.value })} /></div>
                <div className="grid gap-1">
                  <Label>Currency</Label>
                  <Select value={scan.currency} onValueChange={(v) => setScan({ ...scan, currency: v })}>
                    <SelectTrigger aria-label="Scanned currency"><SelectValue /></SelectTrigger>
                    <SelectContent>{[...new Set([scan.currency, ...CURRENCIES])].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-1"><Label htmlFor="sa">Total on bill</Label><Input id="sa" type="number" step="0.01" min="0" className="font-mono" value={scan.amount} onChange={(e) => setScan({ ...scan, amount: e.target.value })} /></div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => { setScan(null); setConfirmed(true); }}>Discard</Button>
                <Button type="button" size="sm" onClick={confirmScan}>Confirm details</Button>
              </div>
            </div>
          )}
        </div>

        {/* Details column */}
        <div className={cn("grid content-start gap-4 rounded-3xl border bg-card p-5 sm:p-6", !confirmed && "pointer-events-none opacity-50")}>
          <div className="grid gap-2">
            <Label>Business or personal?{af("scope")}</Label>
            <ScopeToggle value={scope} onChange={setScope} />
          </div>
          <div className="grid gap-2">
            <Label>For whom</Label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="For whom">
              {[{ id: "me", name: "Me" }, ...members].map((m) => (
                <button key={m.id} type="button" role="radio" aria-checked={memberId === m.id} onClick={() => setMemberId(m.id)}
                  className={cn("rounded-full border px-3 py-1.5 text-xs font-medium transition", memberId === m.id ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-secondary")}>
                  {m.name}
                </button>
              ))}
              <Link to="/family" className="rounded-full border border-dashed px-3 py-1.5 text-xs text-muted-foreground">+ Family</Link>
            </div>
          </div>
          <div className="grid gap-2"><Label htmlFor="t">Title{af("title")}</Label><Input id="t" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Client lunch – Acme" /></div>
          <div className="grid gap-2"><Label htmlFor="m">Merchant{af("merchant")}</Label><Input id="m" value={merchant} onChange={(e) => setMerchant(e.target.value)} /></div>
          <div className="grid grid-cols-[110px_1fr] gap-3">
            <div className="grid gap-2">
              <Label>Currency{af("currency")}</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger aria-label="Currency"><SelectValue /></SelectTrigger>
                <SelectContent>{[...new Set([currency, ...CURRENCIES])].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label htmlFor="a">Amount on bill{af("amount")}</Label><Input id="a" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="font-mono" /></div>
          </div>
          {currency !== BASE_CURRENCY && (
            <div className="rounded-2xl bg-secondary px-4 py-3 text-sm" aria-live="polite">
              {fx === null ? <span className="text-muted-foreground">Fetching the rate for {date}…</span>
                : "error" in fx ? <span className="text-destructive">{fx.error}</span>
                : <>
                    <span className="font-mono font-semibold">{converted != null ? money(converted) : "—"}</span>
                    <span className="ml-2 text-xs text-muted-foreground">1 {currency} = {fx.rate.toFixed(4)} INR · rate of {fx.date}</span>
                  </>}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2"><Label htmlFor="d">Date{af("date")}</Label><Input id="d" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="grid gap-2">
              <Label>Category{af("category")}</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Paid with{af("payment")}</Label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Payment method">
              {PAYMENT_METHODS.map((p) => (
                <button key={p} type="button" role="radio" aria-checked={paymentMethod === p} onClick={() => setPaymentMethod(p)}
                  className={cn("rounded-full border px-3 py-1.5 text-xs font-medium transition", paymentMethod === p ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-secondary")}>
                  {PAYMENT_LABEL[p]}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-2"><Label htmlFor="desc">Business purpose{af("description")}</Label><Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <Button type="submit" size="lg" className="rounded-2xl" disabled={reading || saving || !confirmed}>
            {saving ? "Saving…" : editing ? "Save changes" : "Save expense"}
          </Button>
        </div>
      </form>
    </>
  );
}
