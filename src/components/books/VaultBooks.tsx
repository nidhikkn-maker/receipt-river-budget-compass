/** DocuRepo organisation (v6 §8–11): logical folders, entity/year/registration filters, links, retention and controlled export. */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Fold } from "@/components/Fold";
import { useStore } from "@/lib/store";
import { DOC_LABEL, currentVersions, type DocType } from "@/lib/documents";
import { applyDocQuery, parseDocQuery, DEFAULT_RETENTION, filterRepo, folders, linksOf, pastRetention, renewalReminders, type FolderBy } from "@/lib/books/docrepo";
import { fyOf } from "@/lib/entities";
import { useBooks } from "./useBooks";

export function VaultBooks() {
  const { documents, signedUrl } = useStore();
  const { books, save, preferences } = useBooks();
  const entities = preferences.entities ?? [];
  const docs = useMemo(() => currentVersions(documents), [documents]);
  const [by, setBy] = useState<FolderBy>("entity");
  const [entityId, setEntityId] = useState(""); const [fy, setFy] = useState(""); const [reg, setReg] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [ask, setAsk] = useState("");
  const nl = ask.trim() ? parseDocQuery(ask, entities, today) : null;
  const filtered0 = filterRepo(docs, { ...(entityId ? { entityId } : {}), ...(fy ? { fy } : {}), ...(reg ? { reg } : {}) }, books.docLinks, entities);
  const filtered = nl ? applyDocQuery(filtered0, nl, books.docLinks, entities) : filtered0;
  const groups = folders(filtered, by, books.docLinks, entities);
  const years = [...new Set(docs.map((d) => fyOf(d.docDate ?? d.createdAt.slice(0, 10))))].sort().reverse();
  const old = pastRetention(docs, today, books.retentionYears);
  const renew = renewalReminders(docs, today, 60);

  const exportZip = async () => {
    const chosen = docs.filter((d) => picked.includes(d.id));
    if (!chosen.length) return;
    setBusy(true);
    setExportError(null);
    try {
      const { selectedDocumentZip } = await import('@/lib/books/docrepo-export');
      const bytes = await selectedDocumentZip(docs, picked, books.docLinks, new Date().toISOString(), signedUrl);
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/zip" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `docurepo-export-${today}.zip`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
      toast.success(`${chosen.length} original document${chosen.length > 1 ? "s" : ""} exported with a manifest`);
    } catch (e) { const message = (e as Error).message; setExportError(message); toast.error(message); } finally { setBusy(false); }
  };

  return (
    <Fold id="organise" title="Folders, filters & export" hint={`${docs.length} documents · ${renew.length} renewals in 60 days${old.length ? ` · ${old.length} past retention` : ""}`}>
      <div className="space-y-3 text-sm">
        <Link to="/statements" className="inline-block text-xs font-semibold text-primary underline">Upload through Statement Desk — it identifies, reads and files any document</Link>
        <Input aria-label="Ask in plain words" placeholder="e.g. Krupa invoices above 1 lakh last year" value={ask} onChange={(e) => setAsk(e.target.value)} />
        {nl && <p className="break-words text-xs text-muted-foreground">Understood as: {[nl.types.length ? nl.types.map((t) => t.replace(/_/g, " ")).join(", ") : "any type", nl.entityId ? entities.find((e) => e.id === nl.entityId)?.name : null, nl.min != null ? `above ₹${nl.min.toLocaleString("en-IN")}` : null, nl.max != null ? `below ₹${nl.max.toLocaleString("en-IN")}` : null, nl.from ? `${nl.from} to ${nl.to}` : null, nl.words.length ? `containing “${nl.words.join(" ")}”` : null].filter(Boolean).join(" · ")} — {filtered.length} found</p>}
        <div className="grid gap-2 sm:grid-cols-3">
          <select aria-label="Company filter" className="rounded-md border bg-background px-2 py-2" value={entityId} onChange={(e) => setEntityId(e.target.value)}><option value="">All companies & people</option>{entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
          <select aria-label="Financial year filter" className="rounded-md border bg-background px-2 py-2" value={fy} onChange={(e) => setFy(e.target.value)}><option value="">All years</option>{years.map((y) => <option key={y} value={y}>FY {y}</option>)}</select>
          <Input aria-label="Registration number" placeholder="PAN, GSTIN, CIN, survey no." value={reg} onChange={(e) => setReg(e.target.value)} />
        </div>
        <div className="flex gap-1 text-xs">{(["entity", "year", "type"] as FolderBy[]).map((b) => <button key={b} type="button" onClick={() => setBy(b)} className={`rounded-full border px-3 py-1 ${by === b ? "bg-primary text-primary-foreground" : "bg-card"}`}>By {b === "entity" ? "company" : b}</button>)}</div>
        {groups.map((g) => <details key={g.name} className="rounded-xl border px-3 py-2"><summary className="cursor-pointer">{g.name} <span className="text-xs text-muted-foreground">· {g.ids.length}</span></summary>
          {g.ids.map((id) => { const d = docs.find((x) => x.id === id)!; const ls = linksOf(books.docLinks, id); return <label key={id} className="flex items-start gap-2 py-1 text-xs"><input type="checkbox" checked={picked.includes(id)} onChange={(e) => setPicked(e.target.checked ? [...picked, id] : picked.filter((x) => x !== id))} />
            <span className="min-w-0"><b className="break-words">{d.title}</b><span className="block text-muted-foreground">{DOC_LABEL[d.docType]} · {d.fileName}{ls.length ? ` · linked to ${ls.map((l) => `${l.kind} ${l.label}`).join(", ")}` : ""}</span></span></label>; })}
        </details>)}
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!picked.length} loading={busy} onClick={exportZip}>Export {picked.length || ""} as ZIP</Button>{picked.length > 0 && <Button size="sm" variant="ghost" onClick={() => setPicked([])}>Clear</Button>}</div>
        {exportError && <p role="alert" className="text-xs text-destructive">Export not created: {exportError}. Selection retained; retry Export.</p>}
        {renew.length > 0 && <div className="text-xs"><b>Renewals coming up</b>{renew.map((r) => <p key={r.key}>{r.title}</p>)}<p className="text-muted-foreground">These also appear in your reminders.</p></div>}
        <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Retention policy{old.length ? ` · ${old.length} past retention` : ""}</summary>
          <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">{(Object.keys(DEFAULT_RETENTION) as DocType[]).map((t) => <label key={t}>{DOC_LABEL[t]}<Input type="number" min={0} className="h-8" value={books.retentionYears[t] ?? DEFAULT_RETENTION[t] ?? 8} onChange={(e) => save({ retentionYears: { ...books.retentionYears, [t]: Math.max(0, Number(e.target.value) || 0) } })} /></label>)}</div>
          <p className="mt-1 text-muted-foreground">Years kept after the financial year ends; 0 keeps permanently. Documents past retention are listed for you to review — Ledgerline never deletes them on its own.</p>
          {old.map((d) => <p key={d.id}>{d.title} · {d.docDate ?? d.createdAt.slice(0, 10)}</p>)}
        </details>
      </div>
    </Fold>
  );
}
