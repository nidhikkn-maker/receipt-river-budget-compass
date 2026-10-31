import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { FileText, ExternalLink, Trash2, Upload, Camera, Image as ImageIcon, FolderOpen, ScanLine } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { extractDocument } from "@/lib/document-extract.functions";
import { toast } from "sonner";
import { PageTitle } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExpenseDialog } from "@/components/ExpenseDialog";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { money, type Expense } from "@/lib/expenses";
import { DOC_TYPES, DOC_LABEL, expiringDocuments, searchVault, vaultItems, type DocType, type VaultItem } from "@/lib/documents";
import { todayISO } from "@/lib/use-position";
export const Route=createFileRoute("/_authenticated/vault")({head:()=>({meta:[{title:"Document vault — Ledgerline"},{name:"description",content:"Search receipts and upload linked financial documents."},{property:"og:title",content:"Document vault — Ledgerline"},{property:"og:description",content:"Receipts, statements, insurance and warranties with renewal dates."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary"}]}),component:Vault});
function Vault() {
  const { transactions, documents, accounts, loans, addDocument, updateDocument, removeDocument, signedUrl } = useStore();
  const [q, setQ] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [type, setType] = useState<DocType | "all">("all"); const [selected, setSelected] = useState<Expense | null>(null);
  const [busy, setBusy] = useState(false); const [file, setFile] = useState<File | null>(null); const input = useRef<HTMLInputElement>(null); const cam = useRef<HTMLInputElement>(null); const gal = useRef<HTMLInputElement>(null);
  const scanFn = useServerFn(extractDocument); const [scanning, setScanning] = useState(false); const [text, setText] = useState("");
  const [form, setForm] = useState({ title: "", docType: "other" as DocType, date: todayISO(), amount: "", merchant: "", notes: "", transactionId: "none", accountId: "none", loanId: "none", expiry: "" });
  const items = searchVault(vaultItems(documents, transactions), { q, type, from, to });
  const expires = expiringDocuments(documents, todayISO());
  const upload = async (e: React.FormEvent) => {
    e.preventDefault(); if (!file || busy) return; setBusy(true);
    try {
      await addDocument(file, { title: form.title, docType: form.docType, docDate: form.date || null, amount: form.amount ? Number(form.amount) : null, currency: "INR", merchant: form.merchant || null, notes: form.notes, text,
        transactionId: form.transactionId === "none" ? null : form.transactionId, accountId: form.accountId === "none" ? null : form.accountId, loanId: form.loanId === "none" ? null : form.loanId, expiresOn: form.expiry || null });
      setFile(null); setText(""); setForm({ ...form, title: "", notes: "", amount: "" }); if (input.current) input.current.value = ""; toast.success("Document saved");
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  };
  const isDate = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const pick = async (f: File | null) => {
    setFile(f); setText(""); if (!f) return;
    const base = { ...form, title: f.name.replace(/\.[^.]+$/, "") }; setForm(base);
    if (!(f.type.startsWith("image/") || f.type === "application/pdf")) return;
    if (f.type === "application/pdf" && f.size > 3_000_000) { toast.message("File is large — fill the details manually"); return; }
    setScanning(true);
    try {
      const raw = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(f); });
      const prepared = await (await import("@/lib/image-prep")).prepareForReading(raw, f.type);
      if (prepared.dataUrl.length > 4_000_000) { toast.message("File is large — fill the details manually"); return; }
      const out = await scanFn({ data: prepared });
      if (!out.ok) { toast.error(out.error); return; }
      const x = out.result; setText(x.text);
      setForm({ ...base, title: x.title || base.title, docType: x.docType, merchant: x.merchant ?? "", date: isDate(x.date) ? x.date! : base.date, expiry: isDate(x.expiresOn) ? x.expiresOn! : "", amount: x.amount != null ? String(x.amount) : "", notes: x.notes ?? "" });
      toast.success("Details filled in — please check them");
    } catch { toast.error("Couldn't scan this document"); } finally { setScanning(false); }
  };
  const open = async (item: VaultItem) => {
    if (item.source === "receipt") { setSelected(transactions.find(e => e.id === item.transactionId) ?? null); return; }
    const url = await signedUrl(item.path);
    if (!url) { toast.error("Couldn't open the file — reconnect and try again"); return; }
    const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.click();
  };
  return <>
    <PageTitle eyebrow="Documents" title="Document vault" />
    {expires.length > 0 && <div className="mb-4 border-l-4 border-destructive bg-secondary p-3 text-sm">{expires.map(d => <p key={d.id}>{d.title} · expires {d.expiresOn}</p>)}</div>}
    <div className="mb-5 grid gap-3 sm:grid-cols-4">
      <Input aria-label="Search documents" placeholder="Merchant, amount, filename or text" value={q} onChange={e => setQ(e.target.value)} />
      <Input aria-label="Documents from" type="date" value={from} onChange={e => setFrom(e.target.value)} />
      <Input aria-label="Documents to" type="date" value={to} onChange={e => setTo(e.target.value)} />
      <Select value={type} onValueChange={v => setType(v as DocType | "all")}><SelectTrigger aria-label="Document type filter"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All document types</SelectItem>{DOC_TYPES.map(t => <SelectItem key={t} value={t}>{DOC_LABEL[t]}</SelectItem>)}</SelectContent></Select>
    </div>
    <p className="mb-3 text-sm text-muted-foreground">{items.length} documents</p>
    <div className="mb-8 grid gap-3 sm:grid-cols-2">{items.map(item => <article key={item.key} className="min-w-0 rounded-lg border bg-card p-4">
      <Button variant="ghost" className="h-auto w-full justify-start gap-3 whitespace-normal p-0 text-left" onClick={() => void open(item)}><FileText className="h-6 w-6 shrink-0 text-primary" /><span className="min-w-0"><span className="block break-words font-semibold">{item.title}</span><span className="block text-xs text-muted-foreground">{DOC_LABEL[item.docType]} · {item.date ?? "No date"}{item.amount != null && ` · ${money(item.amount, item.currency)}`}</span><span className="block break-words text-xs text-muted-foreground">{item.fileName}</span></span><ExternalLink className="ml-auto h-4 w-4 shrink-0" /></Button>
      {item.source === "document" && <div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => { const title = window.prompt("Document title", item.title); if (title && item.docId) void updateDocument(item.docId, { title }).then(() => toast.success("Document updated")).catch(e => toast.error(e.message)); }}>Rename</Button><Button size="icon" variant="ghost" aria-label={`Delete document ${item.title}`} onClick={() => { const doc = documents.find(d => d.id === item.docId); if (doc && window.confirm(`Delete ${doc.title} and its file?`)) void removeDocument(doc).then(() => toast.success("Document deleted")).catch(e => toast.error(e.message)); }}><Trash2 className="h-4 w-4" /></Button></div>}
    </article>)}</div>
    <form onSubmit={upload} className="grid gap-3 border-t pt-6 sm:grid-cols-2">
      <h2 className="font-display text-xl font-bold sm:col-span-2">Add document</h2>
      <div className="rounded-3xl border-2 border-dashed border-primary/40 bg-secondary/50 p-4 text-center sm:col-span-2">
        <ScanLine className="mx-auto h-7 w-7 text-primary" />
        <p className="mt-1 font-semibold">{scanning ? "Reading your document…" : file ? file.name : "Scan or choose a document"}</p>
        <p className="text-xs text-muted-foreground">Photos and PDFs are read automatically; check the details before saving.</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Button type="button" variant="secondary" className="h-auto flex-col gap-1 py-3" disabled={scanning} onClick={() => cam.current?.click()}><Camera className="h-5 w-5" /><span className="text-xs">Camera</span></Button>
          <Button type="button" variant="secondary" className="h-auto flex-col gap-1 py-3" disabled={scanning} onClick={() => gal.current?.click()}><ImageIcon className="h-5 w-5" /><span className="text-xs">Gallery</span></Button>
          <Button type="button" variant="secondary" className="h-auto flex-col gap-1 py-3" disabled={scanning} onClick={() => input.current?.click()}><FolderOpen className="h-5 w-5" /><span className="text-xs">Files</span></Button>
        </div>
        <input ref={cam} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Scan document with camera" onChange={e => void pick(e.target.files?.[0] ?? null)} />
        <input ref={gal} type="file" accept="image/*" className="sr-only" aria-label="Choose document photo" onChange={e => void pick(e.target.files?.[0] ?? null)} />
        <input ref={input} type="file" accept="image/*,.pdf,.csv,.xlsx,.xls,.txt" className="sr-only" aria-label="Document file" onChange={e => void pick(e.target.files?.[0] ?? null)} />
      </div>
      <div className="grid gap-1"><Label htmlFor="doc-title">Title</Label><Input id="doc-title" required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
      <div className="grid gap-1"><Label>Type</Label><Select value={form.docType} onValueChange={v => setForm({ ...form, docType: v as DocType })}><SelectTrigger aria-label="Upload document type"><SelectValue /></SelectTrigger><SelectContent>{DOC_TYPES.map(t => <SelectItem key={t} value={t}>{DOC_LABEL[t]}</SelectItem>)}</SelectContent></Select></div>
      <div className="grid gap-1"><Label htmlFor="doc-date">Date</Label><Input id="doc-date" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
      <div className="grid gap-1"><Label htmlFor="doc-expiry">Expiry / renewal</Label><Input id="doc-expiry" type="date" value={form.expiry} onChange={e => setForm({ ...form, expiry: e.target.value })} /></div>
      <div className="grid gap-1"><Label htmlFor="doc-amount">Amount (INR)</Label><Input id="doc-amount" type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
      <div className="grid gap-1"><Label htmlFor="doc-merchant">Merchant / provider</Label><Input id="doc-merchant" value={form.merchant} onChange={e => setForm({ ...form, merchant: e.target.value })} /></div>
      {[{ key: "transactionId" as const, label: "Linked transaction", list: transactions }, { key: "accountId" as const, label: "Linked account", list: accounts }, { key: "loanId" as const, label: "Linked loan", list: loans }].map(({ key, label, list }) => <div key={key} className="grid gap-1"><Label>{label}</Label><Select value={form[key]} onValueChange={v => setForm({ ...form, [key]: v })}><SelectTrigger aria-label={label}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Not linked</SelectItem>{list.map(x => <SelectItem key={x.id} value={x.id}>{"name" in x ? x.name : x.title}</SelectItem>)}</SelectContent></Select></div>)}
      <div className="grid gap-1"><Label htmlFor="doc-notes">Notes</Label><Input id="doc-notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
      <Button type="submit" disabled={busy || scanning || !file} className="sm:col-span-2"><Upload className="h-4 w-4" />{busy ? "Saving…" : "Save document"}</Button>
    </form>
    <ExpenseDialog expense={selected} onClose={() => setSelected(null)} />
  </>;
}
