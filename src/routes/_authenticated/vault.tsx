import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { openSmartAdd } from '@/lib/smart-add-event';
import { FileText, ExternalLink, ScanLine } from "lucide-react";
import { ContractObligations, NoticeDeadlines } from "@/components/ContractObligations";
import { toast } from "sonner";
import { PageTitle } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExpenseDialog } from "@/components/ExpenseDialog";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { money, type Expense } from "@/lib/expenses";
import { DOC_TYPES, DOC_LABEL, earlierVersions, expiringDocuments, searchVault, vaultItems, linkedLabels, type DocType, type VaultItem } from "@/lib/documents";
import { todayISO } from "@/lib/use-position";
import { VaultBooks } from "@/components/books/VaultBooks";
import { useBooks } from "@/components/books/useBooks";
import { ArchivedTableRecords, TableArchiveButton } from "@/components/ArchivedRecords";
import { splitByTableArchive } from "@/lib/records-archive";
export const Route=createFileRoute("/_authenticated/vault")({head:()=>({meta:[{title:"DocuRepo — Thapal"},{name:"description",content:"Search receipts and every financial document filed through Statement Desk."},{property:"og:title",content:"DocuRepo — Thapal"},{property:"og:description",content:"Receipts, statements, insurance and warranties with renewal dates."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary"}]}),component:Vault});
function Vault() {
  const { accounts, transactions, documents: allDocuments, updateDocument, signedUrl, downloadFile, preferences } = useStore();
  // No delete: a document is archived (who/when/why kept in owner settings) and its row, file and links stay (P0-012).
  const { active: documents, archived: archivedDocs } = splitByTableArchive(preferences, "documents", allDocuments);
  const [q, setQ] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [type, setType] = useState<DocType | "all">("all"); const [selected, setSelected] = useState<Expense | null>(null);
  const navigate = useNavigate();
  const { books } = useBooks();
  const all = vaultItems(documents, transactions);
  const items = searchVault(all, { q, type, from, to }, linkedLabels(all, { accounts, transactions, links: books.docLinks }));
  const expires = expiringDocuments(documents, todayISO());
  const open = async (item: VaultItem) => {
    if (item.source === "receipt") { setSelected(transactions.find(e => e.id === item.transactionId) ?? null); return; }
    const url = await signedUrl(item.path);
    if (!url) { toast.error("Couldn't open the file — reconnect and try again"); return; }
    const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.click();
  };
  return <div className="uix-family-documents">
    <PageTitle eyebrow="Documents" title="DocuRepo" />
    <NoticeDeadlines />
    <VaultBooks />
    {expires.length > 0 && <div className="mb-4 border-l-4 border-destructive bg-secondary p-3 text-sm">{expires.map(d => <p key={d.id}>{d.title} · expires {d.expiresOn}</p>)}</div>}
    <div className="mb-5 grid gap-3 sm:grid-cols-4">
      <Input aria-label="Search documents" placeholder="Merchant, account, asset, tenant, supplier or text" value={q} onChange={e => setQ(e.target.value)} />
      <Input aria-label="Documents from" type="date" value={from} onChange={e => setFrom(e.target.value)} />
      <Input aria-label="Documents to" type="date" value={to} onChange={e => setTo(e.target.value)} />
      <Select value={type} onValueChange={v => setType(v as DocType | "all")}><SelectTrigger aria-label="Document type filter"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All document types</SelectItem>{DOC_TYPES.map(t => <SelectItem key={t} value={t}>{DOC_LABEL[t]}</SelectItem>)}</SelectContent></Select>
    </div>
    <p className="mb-3 text-sm text-muted-foreground">{items.length} documents</p>
    <div className="document-list mb-8 grid gap-0">{items.map(item => <article key={item.key} className="document-item min-w-0 border-b py-5">
      <Button variant="ghost" className="h-auto w-full justify-start gap-3 whitespace-normal p-0 text-left" onClick={() => void open(item)}><FileText className="h-6 w-6 shrink-0 text-primary" /><span className="min-w-0"><span className="block break-words font-semibold">{item.title}</span><span className="block text-xs text-muted-foreground">{DOC_LABEL[item.docType]} · {item.date ?? "No date"}{item.amount != null && ` · ${money(item.amount, item.currency)}`}</span><span className="block break-words text-xs text-muted-foreground">{item.fileName}</span></span><ExternalLink className="ml-auto h-4 w-4 shrink-0" /></Button>
      {item.source === "document" && <div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="outline" aria-label={`Download ${item.title}`} onClick={() => { const doc = documents.find(d => d.id === item.docId); if (doc) void downloadFile(doc.filePath, doc.fileName, { size: doc.size, mimeType: doc.mimeType }).catch(e => toast.error(e.message)); }}>Download</Button><Button size="sm" variant="outline" onClick={() => { const title = window.prompt("Document title", item.title); if (title && item.docId) void updateDocument(item.docId, { title }).then(() => toast.success("Document updated")).catch(e => toast.error(e.message)); }}>Rename</Button>{item.docId && <TableArchiveButton table="documents" id={item.docId} name={item.title} noun="document" />}</div>}
      {item.docId && (() => { const d = allDocuments.find(x => x.id === item.docId); const old = earlierVersions(allDocuments, item.docId); return <>
        {!!d?.fields?.length && <details className="mt-3 text-sm"><summary className="cursor-pointer text-muted-foreground">Key details ({d.fields.length})</summary><dl className="mt-2 grid gap-1">{d.fields.map((f, i) => <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2"><dt className="text-muted-foreground">{f.label}</dt><dd className="break-words">{f.value}{f.originalValue && f.originalValue !== f.value && <span className="block text-xs text-muted-foreground">printed: {f.originalValue}</span>}{f.confidence === "low" && <span className="ml-1 text-xs text-destructive">check</span>}<span className="block text-xs text-muted-foreground">{f.page ? `p.${f.page} · ` : ""}“{f.quote}”</span></dd></div>)}</dl></details>}
        {old.length > 0 && <details className="mt-2 text-sm"><summary className="cursor-pointer text-muted-foreground">{old.length} earlier version{old.length > 1 ? "s" : ""}</summary>{old.map(v => <Button key={v.id} variant="link" className="h-auto p-0 text-xs" onClick={() => void open({ ...item, key: v.id, docId: v.id, path: v.filePath, source: "document" })}>{v.fileName} · {v.createdAt.slice(0, 10)}</Button>)}</details>}
        <div className="mt-2 flex flex-wrap gap-3"><Button size="sm" variant="ghost" className="px-0 text-xs" onClick={() => { if (d) void navigate({ to: "/statements", search: { context: "documents", replaces: d.id } }); }}>Upload new version</Button>
        {d && <Button size="sm" variant="ghost" className="px-0 text-xs" onClick={() => void updateDocument(d.id, { evidenceLocked: !d.evidenceLocked }).then(() => toast.success(d.evidenceLocked ? "Evidence lock removed" : "Kept as audit evidence")).catch(e => toast.error(e.message))}>{d.evidenceLocked ? "Kept as evidence · Unlock" : "Keep as audit evidence"}</Button>}</div>
        <ContractObligations docId={item.docId} /></>; })()}
    </article>)}</div>
    <div className="mb-8"><ArchivedTableRecords id="archived-documents" table="documents" rows={archivedDocs} noun="document" title={`Archived documents (${archivedDocs.length})`} nameOf={(d) => d.title} describe={(d) => `${DOC_LABEL[d.docType]} · ${d.docDate ?? "No date"} · ${d.fileName}`} /></div>
    <section className="space-y-2 border-t pt-6">
      <h2 className="font-display text-xl font-bold">Add document</h2>
      <p className="text-sm text-muted-foreground">Every document goes through Statement Desk, so it is identified, read, checked for duplicates and linked in one place before it is filed here.</p>
      <Button className="w-full sm:w-auto" onClick={() => openSmartAdd('documents')}><ScanLine className="h-4 w-4" />Scan or upload in Statement Desk</Button>
    </section>
    <ExpenseDialog expense={selected} onClose={() => setSelected(null)} />
  </div>;
}
