import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ScopeToggle } from "@/components/ScopeBadge";
import { toast } from "sonner";
import { ScanLine, Sparkles, X, Camera, Image as ImageIcon, FolderOpen, Inbox } from "lucide-react";
import { PageTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BASE_CURRENCY, CATEGORIES, CURRENCIES, PAYMENT_LABEL, PAYMENT_METHODS, convert, money, splitEvenly,
  type Category, type PaymentMethod, type Scope, type ReceiptDetails,
} from "@/lib/expenses";
import { tagValue } from "@/lib/preferences";
import { duplicateBills } from "@/lib/bill-duplicates";
import { quickEntrySearch } from "@/lib/quick-entry";
import { useStore } from "@/lib/store";
import { extractReceipt } from "@/lib/receipt-extract.functions";
import { getFxRate } from "@/lib/fx.functions";
import { parseSpokenEntry } from "@/lib/assistant.functions";
import { useServerFn } from "@tanstack/react-start";
import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCOUNT_LABEL, TXN_LABEL, TXN_TYPES, frequentMerchants, suggestForMerchant, type TxnType } from "@/lib/ledger";

type LocalReceipt = { file: File; name: string; type: string; dataUrl: string };

export const Route = createFileRoute("/_authenticated/new")({
  validateSearch: quickEntrySearch,
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

interface SpeechRec { lang: string; interimResults: boolean; start: () => void; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; onerror: () => void }

interface Scan { merchant: string; date: string; amount: string; currency: string }

function NewExpense() {
  const { save, transactions: expenses, members, accounts, preferences, documents, addDocument, removeDocument, signedUrl } = useStore();
  const PENDING = "pending-receipt";
  const inbox = documents.filter((d) => d.notes === PENDING && !d.transactionId);
  const [fromInbox, setFromInbox] = useState<string[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null); const galleryRef = useRef<HTMLInputElement>(null);
  const saveForLater = async () => {
    try { for (const r of receipts) await addDocument(r.file, { title: `Receipt to add · ${r.name}`.slice(0, 120), docType: "receipt", docDate: null, amount: null, currency: "INR", merchant: null, notes: PENDING, transactionId: null, accountId: null, loanId: null, expiresOn: null });
      toast.success(`${receipts.length} receipt${receipts.length === 1 ? "" : "s"} saved to add later`); setReceipts([]); setScan(null); setConfirmed(true);
    } catch (e) { toast.error((e as Error).message); }
  };
  const useSaved = async (id: string) => {
    const d = inbox.find((x) => x.id === id); if (!d) return;
    const url = await signedUrl(d.filePath); if (!url) { toast.error("Couldn't open the saved receipt"); return; }
    const blob = await (await fetch(url)).blob();
    const dt = new DataTransfer(); dt.items.add(new File([blob], d.fileName, { type: d.mimeType || blob.type }));
    setFromInbox((x) => [...x, id]); await onFiles(dt.files);
  };
  const liveAccounts = accounts.filter((a) => !a.archived);
  const nav = useNavigate();
  const search = Route.useSearch();
  const { edit } = search;
  const editing = edit ? expenses.find((e) => e.id === edit) : undefined;
  const [scope, setScope] = useState<Scope>("personal");
  const [txnType, setTxnType] = useState<TxnType>("expense");
  const [accountId, setAccountId] = useState<string>("none");
  const [toAccountId, setToAccountId] = useState<string>("none");
  const [tags, setTags] = useState("");
  const [memberId, setMemberId] = useState<string>("me");
  const [splitOn, setSplitOn] = useState(false);
  const [shares, setShares] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<string>(preferences.defaultCurrency);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("upi");
  const [category, setCategory] = useState<Category>("Groceries");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [receiptDetails, setReceiptDetails] = useState<ReceiptDetails>({});
  const [receipts, setReceipts] = useState<LocalReceipt[]>([]);
  const [queue, setQueue] = useState<LocalReceipt[]>([]);
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
  const [duplicateApproval, setDuplicateApproval] = useState("");
  const [reading, setReading] = useState(false);
  const [scan, setScan] = useState<Scan | null>(null);
  const [confirmed, setConfirmed] = useState(true);
  const [autoFilled, setAutoFilled] = useState<Set<string>>(new Set());
  const [fx, setFx] = useState<{ rate: number; date: string } | { error: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const parseSpoken = useServerFn(parseSpokenEntry);
  const [listening, setListening] = useState(false);
  const [spoken, setSpoken] = useState("");
  const extract = useServerFn(extractReceipt);
  const intakeApplied = useRef(false);
  useEffect(() => {
    if (edit || intakeApplied.current) return;
    intakeApplied.current = true;
    if (search.title) setTitle(search.title);
    if (search.merchant) setMerchant(search.merchant);
    if (search.amount) setAmount(String(search.amount));
    if (search.currency) setCurrency(search.currency);
    if (search.date) setDate(search.date);
    if (search.payment) setPaymentMethod(search.payment);
    if (search.scope) setScope(search.scope);
    if (search.text) setSpoken(search.text);
  }, [edit, search]);
  useEffect(() => {
    if (edit || !search.account) return;
    const account = liveAccounts.find(a => a.id === search.account || a.name.toLowerCase() === search.account?.toLowerCase());
    if (account) setAccountId(account.id);
  }, [edit, search.account, accounts]);

  const applySpoken = async (text: string) => {
    if (!text.trim()) return;
    setReading(true);
    try {
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const r = await parseSpoken({ data: { text, today, accounts: liveAccounts.map((a) => a.name) } });
      if (!r.ok) { toast.error(r.error); return; }
      const x = r.result;
      const filled = new Set<string>();
      setTxnType(x.txn_type);
      if (x.title) { setTitle(x.title); filled.add("title"); }
      if (x.merchant) { setMerchant(x.merchant); filled.add("merchant"); }
      if (x.amount && x.amount > 0) { setAmount(String(x.amount)); filled.add("amount"); }
      if (x.currency && /^[A-Z]{3}$/.test(x.currency)) { setCurrency(x.currency); filled.add("currency"); }
      if (x.date && isDate(x.date)) { setDate(x.date); filled.add("date"); }
      if (x.category) { setCategory(x.category); filled.add("category"); }
      if (x.payment_method) { setPaymentMethod(x.payment_method); filled.add("paymentMethod"); }
      if (x.scope) { setScope(x.scope); filled.add("scope"); }
      const accountName = x.account_name;
      const acc = accountName && liveAccounts.find((a) => a.name.toLowerCase() === accountName.toLowerCase());
      if (acc) setAccountId(acc.id);
      setAutoFilled(filled);
      toast.success("Filled in from what you said — check and save");
    } catch { toast.error("Couldn't understand that"); } finally { setReading(false); }
  };

  const startVoice = () => {
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const SR = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!SR) { toast.message("Voice isn't available in this browser — type it below instead"); return; }
    const rec = new SR();
    rec.lang = "en-IN"; rec.interimResults = false;
    rec.onresult = (e) => { const t = e.results[0]?.[0]?.transcript ?? ""; setSpoken(t); void applySpoken(t); };
    rec.onend = () => setListening(false);
    rec.onerror = () => { setListening(false); toast.error("Didn't catch that — try again or type it"); };
    setListening(true); rec.start();
  };

  useEffect(() => {
    if (!editing) return;
    setReceiptDetails(editing.receiptDetails ?? {});
    setTitle(editing.title); setMerchant(editing.merchant ?? ""); setAmount(String(editing.originalAmount)); setCurrency(editing.currency);
    setPaymentMethod(editing.paymentMethod); setCategory(editing.category); setDate(editing.date); setDescription(editing.description);
    setScope(editing.scope); setMemberId(editing.memberId ?? "me");
    setTxnType(editing.txnType ?? "expense"); setAccountId(editing.accountId ?? "none"); setToAccountId(editing.toAccountId ?? "none"); setTags((editing.tags ?? []).join(", "));
    setSplitOn(editing.splits.length > 0);
    setShares(Object.fromEntries(editing.splits.map((x) => [x.memberId ?? "me", String(x.amount)])));
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

  const runExtraction = async (first: LocalReceipt, fresh: boolean) => {
    setReading(true);
    try {
      const res = await extract({ data: { dataUrl: first.dataUrl, mimeType: first.type } });
      if (!res.ok) { toast.error(res.error); return; }
      const x = res.result;
      setReceiptDetails({ tax: x.tax, items: x.items, text: x.text });
      const filled = new Set<string>();
      if (x.title && (fresh || !title)) { setTitle(x.title); filled.add("title"); }
      if (x.category) { setCategory(x.category); filled.add("category"); }
      if (x.payment_method) { setPaymentMethod(x.payment_method); filled.add("payment"); }
      if (x.description && (fresh || !description)) { setDescription(x.description); filled.add("description"); }
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

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const big = Array.from(files).find((f) => f.size > 5 * 1024 * 1024);
    if (big) { toast.error(`${big.name} is larger than 5 MB`); return; }
    const read = await Promise.all(Array.from(files).map(readFile));
    const first = read[0];
    if (!first) return;
    if (read.length > 1 && !editing) {
      // Bulk upload: one bill per entry — review and save each, the rest wait in line.
      setReceipts([first]);
      setQueue((q) => [...q, ...read.slice(1)]);
      setBatch((b) => ({ done: b?.done ?? 0, total: (b?.total ?? 0) + read.length }));
      toast.message(`${read.length} bills queued — review and save each one`);
    } else {
      setReceipts((r) => [...r, ...read]);
    }
    await runExtraction(first, false);
  };

  const confirmScan = () => {
    if (!scan) return;
    if (!scan.merchant.trim()) { toast.error("Enter the merchant"); return; }
    if (!(Number(scan.amount) > 0)) { toast.error("Enter an amount greater than zero"); return; }
    if (!isDate(scan.date)) { toast.error("Enter the date"); return; }
    setMerchant(scan.merchant.trim()); rememberMerchant(scan.merchant.trim());
    if (!title.trim()) setTitle(scan.merchant.trim());
    setAmount(scan.amount);
    setDate(scan.date);
    setCurrency(scan.currency);
    setAutoFilled((s) => new Set([...s, "merchant", "amount", "date", "currency"]));
    setConfirmed(true);
  };

  const billIdentity = { merchant: !confirmed && scan ? scan.merchant : merchant, date: !confirmed && scan ? scan.date : date, amount: Number(!confirmed && scan ? scan.amount : amount), currency: !confirmed && scan ? scan.currency : currency };
  const duplicates = txnType === "expense" ? duplicateBills(billIdentity, expenses, edit) : [];
  const duplicateSignature = JSON.stringify([billIdentity, receipts.map(r => r.name), duplicates.map(e => e.id)]);
  const duplicateBlocked = duplicates.length > 0 && duplicateApproval !== duplicateSignature;
  const advanceQueue = async () => {
    const [next, ...rest] = queue;
    setQueue(rest); setBatch(b => next && b ? { done: b.done + 1, total: b.total } : null);
    setFromInbox([]); setDuplicateApproval(""); setReceipts(next ? [next] : []);
    setTitle(""); setMerchant(""); setAmount(""); setDescription(""); setTags("");
    setReceiptDetails({}); setScan(null); setConfirmed(true); setAutoFilled(new Set()); setSplitOn(false); setShares({});
    if (next) await runExtraction(next, true);
  };

  const rememberMerchant = (m: string) => {
    if (editing) return;
    const hit = suggestForMerchant(m, expenses);
    if (!hit) return;
    const filled = new Set(autoFilled);
    if (preferences.categories.some(c=>c.name===hit.category && !c.archived)) { setCategory(hit.category as Category); filled.add("category"); }
    if ((PAYMENT_METHODS as readonly string[]).includes(hit.paymentMethod)) { setPaymentMethod(hit.paymentMethod as PaymentMethod); filled.add("paymentMethod"); }
    if (hit.scope === "business" || hit.scope === "personal") { setScope(hit.scope); filled.add("scope"); }
    if (hit.accountId && liveAccounts.some((a) => a.id === hit.accountId)) setAccountId(hit.accountId);
    if (hit.tags.length && !tags.trim()) setTags(hit.tags.join(", "));
    setAutoFilled(filled);
    toast.message(`Filled in from your last ${m} entry`);
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!confirmed) { toast.error("Confirm the scanned bill details first"); return; }
    if (duplicateBlocked) { toast.error("Review the possible duplicate or skip this bill"); return; }
    setSaving(true);
    try {
      await save(
        { title: title.trim(), amount: Number(amount), currency, paymentMethod, category, date, description, merchant: merchant.trim() || null,
          receiptDetails, scope, memberId: memberId === "me" ? null : memberId,
          txnType, accountId: accountId === "none" ? null : accountId, toAccountId: toAccountId === "none" ? null : toAccountId,
          tags: [...new Set(tags.split(",").map((t) => t.trim()).filter(Boolean))],
          splits: splitOn ? Object.entries(shares).map(([k, v]) => ({ memberId: k === "me" ? null : k, amount: Number(v) })) : [] },
        { ...(editing ? { id: editing.id } : {}), files: receipts.map((r) => r.file) },
      );
      for (const id of fromInbox) { const d = documents.find((x) => x.id === id); if (d) await removeDocument(d).catch(() => {}); }
      toast.success(editing ? "Entry updated" : `${TXN_LABEL[txnType]} saved`);
      if (!editing && queue.length) {
        await advanceQueue();
        return;
      }
      setBatch(null);
      nav({ to: editing ? "/expenses" : "/dashboard" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const people = [{ id: "me", name: "Me" }, ...members];
  const splitLeft = Math.round(((Number(amount) || 0) - Object.values(shares).reduce((a, v) => a + (Number(v) || 0), 0)) * 100) / 100;
  const af = (k: string) => autoFilled.has(k) && <Sparkles className="ml-1 inline h-3 w-3 text-primary" aria-label="Auto-filled" />;
  const converted = fx && "rate" in fx && Number(amount) > 0 ? convert(Number(amount), fx.rate) : null;

  return (
    <>
      <PageTitle eyebrow={editing ? "Edit expense" : "New expense"} title={editing ? editing.title : "Scan a bill"} sub="Any currency — we convert to ₹ with that day's rate." />
      <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
        {/* Scan column */}
        <div className="space-y-4">
          <div className="rounded-3xl border-2 border-dashed border-primary/40 bg-secondary/50 p-5 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-hero text-ink-foreground shadow-float"><ScanLine className="h-7 w-7" /></span>
            <p className="mt-2 font-display text-lg font-bold">{reading ? "Reading your bill…" : "Add a bill or receipt"}</p>
            <p className="text-xs text-muted-foreground">Photo or PDF · we fill in the rest · pick several to review one by one</p>
            {batch && <p className="mt-2 inline-block rounded-full bg-gold px-3 py-1 text-xs font-bold text-gold-foreground">Bill {batch.done + 1} of {batch.total}{queue.length ? ` · ${queue.length} waiting` : ""}</p>}
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Button type="button" variant="secondary" className="h-auto flex-col gap-1 py-3" onClick={() => cameraRef.current?.click()}><Camera className="h-5 w-5" /><span className="text-xs">Camera</span></Button>
              <Button type="button" variant="secondary" className="h-auto flex-col gap-1 py-3" onClick={() => galleryRef.current?.click()}><ImageIcon className="h-5 w-5" /><span className="text-xs">Gallery</span></Button>
              <Button type="button" variant="secondary" className="h-auto flex-col gap-1 py-3" onClick={() => fileRef.current?.click()}><FolderOpen className="h-5 w-5" /><span className="text-xs">Files</span></Button>
            </div>
          </div>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Take a photo of a receipt" onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }} />
          <input ref={galleryRef} type="file" multiple accept="image/*" className="sr-only" aria-label="Choose receipt photos" onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }} />
          {inbox.length > 0 && (
            <div className="rounded-3xl border bg-card p-4">
              <p className="flex items-center gap-2 font-display font-bold"><Inbox className="h-4 w-4 text-gold" />Saved receipts to add ({inbox.length})</p>
              <ul className="mt-2 divide-y text-sm">{inbox.map((d) => <li key={d.id} className="flex items-center justify-between gap-2 py-2"><span className="min-w-0 truncate">{d.fileName}</span><span className="flex shrink-0 gap-1"><Button type="button" size="sm" variant="outline" disabled={fromInbox.includes(d.id) || reading} onClick={() => void useSaved(d.id)}>Use</Button><Button type="button" size="icon" variant="ghost" aria-label={`Delete ${d.fileName}`} onClick={() => void removeDocument(d)}><X className="h-4 w-4" /></Button></span></li>)}</ul>
            </div>
          )}
          <div className="flex gap-2 rounded-3xl border bg-card p-2">
            <Button type="button" size="icon" variant={listening ? "default" : "secondary"} onClick={startVoice} aria-label="Speak an entry" className="h-11 w-11 shrink-0 rounded-2xl"><Mic className="h-5 w-5" /></Button>
            <Input aria-label="Say or type an entry" placeholder='"Spent ₹2,500 on dinner using AMEX yesterday"' value={spoken} onChange={(e) => setSpoken(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void applySpoken(spoken); } }} className="border-0 shadow-none focus-visible:ring-0" />
            <Button type="button" variant="ghost" onClick={() => applySpoken(spoken)} disabled={!spoken.trim() || reading}>Fill</Button>
          </div>
          <input ref={fileRef} id="r" type="file" multiple accept="image/*,application/pdf" className="sr-only" aria-label="Choose receipt files" onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }} />
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
          {receipts.length > 0 && !editing && fromInbox.length === 0 && <Button type="button" variant="outline" size="sm" onClick={() => void saveForLater()}><Inbox className="mr-1 h-4 w-4" />Save receipts to add later</Button>}

          {duplicates.length > 0 && !reading && <section aria-label="Possible duplicate bills" className="space-y-3 rounded-lg border border-gold bg-gold-soft p-4">
            <h2 className="font-display font-bold">This bill may already exist</h2>
            <ul className="space-y-2 text-sm">{duplicates.map(e => <li key={e.id} className="flex flex-wrap items-center justify-between gap-2"><span>{e.merchant} · {e.date} · {e.currency} {e.originalAmount.toFixed(2)}</span><Link to="/new" search={{ edit: e.id }} target="_blank" rel="noopener noreferrer" className="text-primary underline">Review existing entry</Link></li>)}</ul>
            <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void advanceQueue()}>Skip this bill</Button><Button type="button" size="sm" variant="secondary" disabled={!duplicateBlocked} onClick={() => setDuplicateApproval(duplicateSignature)}>{duplicateBlocked ? "Keep as a separate bill" : "Separate bill confirmed"}</Button></div>
          </section>}
          {batch && duplicates.length === 0 && <Button type="button" variant="ghost" size="sm" disabled={reading || saving} onClick={() => void advanceQueue()}>Skip this bill</Button>}

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
              <div className="grid gap-1"><Label htmlFor="receipt-tax">Tax included</Label><Input id="receipt-tax" type="number" min="0" step="0.01" value={receiptDetails.tax ?? ""} onChange={e=>setReceiptDetails({...receiptDetails,tax:e.target.value===""?null:Number(e.target.value)})}/></div>
              {(receiptDetails.items??[]).map((item,i)=><div key={i} className="grid grid-cols-[1fr_64px_80px] gap-2"><Input aria-label={`Item ${i+1} name`} value={item.name} onChange={e=>setReceiptDetails({...receiptDetails,items:(receiptDetails.items ?? []).map((x,j)=>j===i?{...x,name:e.target.value}:x)})}/><Input aria-label={`Item ${i+1} quantity`} type="number" value={item.quantity} onChange={e=>setReceiptDetails({...receiptDetails,items:(receiptDetails.items ?? []).map((x,j)=>j===i?{...x,quantity:Number(e.target.value)}:x)})}/><Input aria-label={`Item ${i+1} amount`} type="number" step="0.01" value={item.amount} onChange={e=>setReceiptDetails({...receiptDetails,items:(receiptDetails.items ?? []).map((x,j)=>j===i?{...x,amount:Number(e.target.value)}:x)})}/></div>)}
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
            <Label>Type</Label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Transaction type">
              {TXN_TYPES.map((t) => (
                <button key={t} type="button" role="radio" aria-checked={txnType === t} onClick={() => setTxnType(t)}
                  className={cn("min-h-11 rounded-full border px-4 text-sm font-medium transition", txnType === t ? "border-gold bg-gold text-gold-foreground" : "bg-background hover:bg-secondary")}>
                  {TXN_LABEL[t]}
                </button>
              ))}
            </div>
            {txnType === "transfer" && <p className="text-xs text-muted-foreground">Moving money between your own accounts (or paying a card bill) isn't counted as spending or income.</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>{txnType === "transfer" ? "From account" : "Account"}</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger aria-label="Account"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not set</SelectItem>
                  {liveAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name} · {ACCOUNT_LABEL[a.kind]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {txnType === "transfer" && (
              <div className="grid gap-2">
              <Label>To account</Label>
              <Select value={toAccountId} onValueChange={setToAccountId}>
                <SelectTrigger aria-label="To account"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not set</SelectItem>
                  {liveAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name} · {ACCOUNT_LABEL[a.kind]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            )}
          </div>
          {!liveAccounts.length && <p className="-mt-2 text-xs text-muted-foreground">Add your bank, card and cash accounts on the <Link to="/wealth" className="text-primary underline">Wealth</Link> page.</p>}
          <div className="grid gap-2">
            <Label htmlFor="tags">Tags</Label>
            <div className="flex flex-wrap gap-2">{preferences.tags.map(t=>{const v=tagValue(t);const selected=tags.split(",").map(x=>x.trim()).includes(v);return <label key={v} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={selected} onChange={e=>{const xs=tags.split(",").map(x=>x.trim()).filter(Boolean);setTags((e.target.checked?[...xs,v]:xs.filter(x=>x!==v)).join(", "));}}/>{v}</label>})}</div><Input id="tags" placeholder="e.g. VEI, reimbursable, essential" value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Business or personal?{af("scope")}</Label>
            <ScopeToggle value={scope} onChange={setScope} />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>For whom</Label>
              <label className="flex items-center gap-2 text-xs font-medium">
                <input type="checkbox" checked={splitOn} className="accent-[var(--primary)]"
                  onChange={(e) => { setSplitOn(e.target.checked); if (e.target.checked && !Object.keys(shares).length) setShares({ [memberId]: "" }); }} />
                Split between people
              </label>
            </div>
            <div className="flex flex-wrap gap-2" role={splitOn ? "group" : "radiogroup"} aria-label="For whom">
              {people.map((m) => {
                const on = splitOn ? m.id in shares : memberId === m.id;
                return (
                  <button key={m.id} type="button" role={splitOn ? "checkbox" : "radio"} aria-checked={on}
                    onClick={() => {
                      if (!splitOn) return setMemberId(m.id);
                      setShares((x) => { const n = { ...x }; if (m.id in n) delete n[m.id]; else n[m.id] = ""; return n; });
                    }}
                    className={cn("rounded-full border px-3 py-1.5 text-xs font-medium transition", on ? "border-gold bg-gold text-gold-foreground" : "bg-background hover:bg-secondary")}>
                    {m.name}
                  </button>
                );
              })}
              <Link to="/family" className="rounded-full border border-dashed px-3 py-1.5 text-xs text-muted-foreground">+ Family</Link>
            </div>
            {splitOn && (
              <div className="space-y-2 rounded-2xl border bg-secondary/40 p-3">
                {Object.keys(shares).length === 0 && <p className="text-xs text-muted-foreground">Tap people above to add them.</p>}
                {Object.entries(shares).map(([id, v]) => (
                  <div key={id} className="flex items-center gap-2">
                    <span className="flex-1 text-sm">{people.find((p) => p.id === id)?.name ?? "Family"}</span>
                    <span className="text-xs text-muted-foreground">{currency}</span>
                    <Input aria-label={`Share for ${people.find((p) => p.id === id)?.name}`} type="number" step="0.01" min="0" className="h-8 w-28 font-mono"
                      value={v} onChange={(e) => setShares((x) => ({ ...x, [id]: e.target.value }))} />
                  </div>
                ))}
                <div className="flex items-center justify-between pt-1 text-xs">
                  <span className={cn("font-mono", Math.abs(splitLeft) > 0.009 ? "text-destructive" : "text-muted-foreground")}>
                    {Math.abs(splitLeft) > 0.009 ? `${splitLeft > 0 ? "Left to assign" : "Over by"}: ${Math.abs(splitLeft).toFixed(2)}` : "Shares add up ✓"}
                  </span>
                  <Button type="button" size="sm" variant="outline" disabled={!(Number(amount) > 0) || !Object.keys(shares).length}
                    onClick={() => setShares(Object.fromEntries(splitEvenly(Number(amount), Object.keys(shares)).map((x) => [x.memberId, String(x.amount)])))}>
                    Split evenly
                  </Button>
                </div>
              </div>
            )}
          </div>
          <div className="grid gap-2"><Label htmlFor="t">Title{af("title")}</Label><Input id="t" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Client lunch – Acme" /></div>
          <div className="grid gap-2"><Label htmlFor="m">Merchant{af("merchant")}</Label><Input id="m" list="merchant-list" value={merchant} onChange={(e) => setMerchant(e.target.value)} onBlur={() => rememberMerchant(merchant)} />
            <datalist id="merchant-list">{frequentMerchants(expenses).map((m) => <option key={m} value={m} />)}</datalist></div>
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
                <SelectContent>{[...new Set([...(editing ? [category] : []), ...preferences.categories.filter(c=>!c.archived).map(c=>c.name)])].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Paid with{af("payment")}</Label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Payment method">
              {PAYMENT_METHODS.map((p) => (
                <button key={p} type="button" role="radio" aria-checked={paymentMethod === p} onClick={() => setPaymentMethod(p)}
                  className={cn("rounded-full border px-3 py-1.5 text-xs font-medium transition", paymentMethod === p ? "border-gold bg-gold text-gold-foreground" : "bg-background hover:bg-secondary")}>
                  {PAYMENT_LABEL[p]}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-2"><Label htmlFor="desc">Business purpose{af("description")}</Label><Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <Button type="submit" size="lg" variant="gold" className="rounded-2xl" disabled={reading || saving || !confirmed || duplicateBlocked}>
            {saving ? "Saving…" : editing ? "Save changes" : "Save expense"}
          </Button>
        </div>
      </form>
    </>
  );
}
