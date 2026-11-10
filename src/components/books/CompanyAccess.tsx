import { downloadBlob } from "@/lib/reports";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store";
import { companyDocuments, type EntityAccounts } from "@/lib/books/entity-accounts";
import { confirmAction } from "@/lib/confirm";
import { filterShared, rowsFor, sharedCompanyCsv, sharedCompanyPdf, sharedCompanyExcel, type SharedCompany, type SharedDoc, type SharedTxn } from "@/lib/books/shared-company";
import { uploadCompanyDocument } from "@/lib/books/company-upload";
import { withStepUp } from "@/lib/step-up";
import { ValueDialog } from "@/components/ValueDialog";
import { requiredText } from "@/lib/value-edits";

type Grant = { id: string; member_email: string; created_at: string; can_write: boolean };

/** Owner-side: who may read this company's tagged documents, and which documents are tagged. Enforced in the database, not here. */
export function CompanyAccess({ entityId, entityName, links }: { entityId: string; entityName: string; links: EntityAccounts }) {
  const { documents, updateDocument, userId } = useStore();
  const [grants, setGrants] = useState<Grant[]>([]);
  const [email, setEmail] = useState("");
  const load = useCallback(async () => {
    const { data } = await supabase.from("entity_members").select("id,member_email,created_at,can_write").eq("owner_id", userId).eq("entity_id", entityId).is("revoked_at", null).order("created_at");
    setGrants(data ?? []);
  }, [entityId, userId]);
  useEffect(() => { void load(); }, [load]);
  const { tagged, suggested } = companyDocuments(documents, links, entityId);
  const tag = async (ids: string[], value: string | null) => { for (const id of ids) await updateDocument(id, { entityId: value }); toast.success(value ? `${ids.length} document(s) tagged to ${entityName}` : "Removed from company"); };
  return (
    <details className="rounded-xl border p-3 text-sm">
      <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Access & documents · {grants.length} people · {tagged.length} documents</summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-muted-foreground">People you add see only documents and entries tagged to {entityName}. Your personal and other companies' records stay private. View-only people cannot change anything; editors can change this company's entries but never move them out of it.</p>
        {grants.map((g) => (
          <div key={g.id} className="flex items-center justify-between gap-2 rounded-lg bg-secondary/50 px-3 py-1.5">
            <span className="truncate">{g.member_email}<span className="ml-2 text-xs text-muted-foreground">{g.can_write ? "Can edit" : "View only"}</span></span>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => {
              if (!(await confirmAction(`Remove ${g.member_email}'s access to ${entityName}?`))) return;
              const { error } = await withStepUp(() => supabase.rpc("revoke_entity_access", { _id: g.id }));
              if (error) toast.error(error.message); else { toast.success("Access removed"); void load(); }
            }}>Remove</Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Input aria-label={`Email to share ${entityName}`} type="email" placeholder="accountant@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          {([false, true] as const).map((w) => (
            <Button key={String(w)} variant="outline" disabled={!email.includes("@")} onClick={async () => {
              if (w && !(await confirmAction(`Let ${email} change ${entityName}'s entries?`))) return;
              const { error } = await withStepUp(() => supabase.rpc("grant_entity_access", { _entity: entityId, _email: email, _write: w }));
              if (error) toast.error(error.message); else { toast.success(w ? "Edit access given" : "View access given"); setEmail(""); void load(); }
            }}>{w ? "Can edit" : "View only"}</Button>
          ))}
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground">Tagged documents</p>
          {tagged.length === 0 && <p className="text-xs text-muted-foreground">None yet.</p>}
          {tagged.map((d) => <div key={d.id} className="flex items-center justify-between gap-2"><span className="truncate">{d.title}</span><Button size="sm" variant="ghost" onClick={() => void tag([d.id], null)}>Untag</Button></div>)}
          {suggested.length > 0 && <Button size="sm" variant="outline" onClick={() => void tag(suggested.map((d) => d.id), entityId)}>Tag {suggested.length} document(s) from this company's accounts</Button>}
        </div>
      </div>
    </details>
  );
}

/** Member-side: companies other owners shared with you. The database decides what is visible; this only groups it. */
export function SharedWithMe() {
  const { signedUrl, downloadFile } = useStore();
  const [companies, setCompanies] = useState<SharedCompany[] | null>(null);
  const [txns, setTxns] = useState<SharedTxn[]>([]);
  const [docs, setDocs] = useState<SharedDoc[]>([]);
  const [queries, setQueries] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ id: string; title: string; company: string } | null>(null);
  const load = useCallback(async () => {
    const { data: cs } = await supabase.rpc("my_shared_companies");
    const list = (cs ?? []) as SharedCompany[];
    setCompanies(list);
    if (!list.length) { setTxns([]); setDocs([]); return; }
    const ids = [...new Set(list.map((c) => c.entity_id))], owners = [...new Set(list.map((c) => c.owner_id))];
    const [t, d] = await Promise.all([
      supabase.from("expenses").select("id,employee_id,entity_id,title,merchant,category,amount,currency,expense_date,txn_type").in("employee_id", owners).in("entity_id", ids).order("expense_date", { ascending: false }).limit(1000),
      supabase.from("documents").select("id,owner_id,entity_id,title,doc_type,doc_date,file_path,file_name,mime_type,size_bytes").in("owner_id", owners).in("entity_id", ids).order("created_at", { ascending: false }).limit(500),
    ]);
    setTxns((t.data ?? []) as SharedTxn[]); setDocs((d.data ?? []) as SharedDoc[]);
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (!companies?.length) return null;
  const rename = async (id: string, title: string) => {
    const { data, error } = await supabase.from("expenses").update({ title }).eq("id", id).select("id");
    if (error || !data?.length) toast.error("You can only view this company"); else { toast.success("Saved"); void load(); }
  };
  const upload = async (c: SharedCompany, file: File) => {
    try { await uploadCompanyDocument(c.owner_id, c.entity_id, file, {
      canWrite: async (owner, entity) => { const r = await supabase.rpc("can_access_entity", { _owner: owner, _entity: entity, _write: true }); return !r.error && r.data === true; },
      upload: async (path, source) => { const r = await supabase.storage.from("receipts").upload(path, source, { contentType: source.type || "application/octet-stream" }); if (r.error) throw Error("Couldn't upload this document"); },
      save: async (id, path) => { const { error } = await supabase.from("documents").insert({
      id,
      owner_id: c.owner_id, entity_id: c.entity_id, title: file.name.replace(/\.[^.]+$/, ""), doc_type: "other",
      file_path: path, file_name: file.name.slice(0, 200), mime_type: file.type || "application/octet-stream", size_bytes: file.size,
      currency: "INR", notes: "", extracted_text: "", fields: [],
      }); if (error) throw Error("Couldn't save the document"); },
      find: async (id, path) => { const r = await supabase.from("documents").select("id").eq("id", id).eq("file_path", path).eq("owner_id", c.owner_id).eq("entity_id", c.entity_id); if (r.error) throw Error("Could not check upload"); return !!r.data?.length; },
      remove: async path => { const r = await supabase.storage.from("receipts").remove([path]); if (r.error) throw Error("Could not remove upload"); },
    }); } catch (error) { toast.error(error instanceof Error ? error.message : "Couldn't upload this document"); void load(); return; }
    toast.success("Document added to the shared company"); void load();
  };
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <p className="font-semibold">Shared with you</p>
      <p className="text-xs text-muted-foreground">Companies other people gave you access to. Never added to your own records or totals.</p>
      {companies.map((c) => {
        const all = rowsFor(txns, c, (r) => r.employee_id), allDocs = rowsFor(docs, c, (r) => r.owner_id);
        const q = (queries[c.grant_id] ?? "").trim();
        const t = filterShared(all, q, (r) => [r.title, r.merchant, r.category, r.expense_date]);
        const d = filterShared(allDocs, q, (r) => [r.title, r.doc_type, r.doc_date]);
        return (
          <details key={c.grant_id} className="rounded-xl border p-3 text-sm">
            <summary className="cursor-pointer"><span className="font-medium">{c.company_name}</span> <span className="text-xs text-muted-foreground">· {c.owner_email} · {c.can_write ? "Can edit" : "View only"} · {all.length} entries · {allDocs.length} documents</span></summary>
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Input aria-label={`Search ${c.company_name}`} placeholder="Search entries and documents" className="h-8 max-w-56" value={queries[c.grant_id] ?? ""} onChange={(e) => setQueries((s) => ({ ...s, [c.grant_id]: e.target.value }))} />
                <Button size="sm" variant="outline" onClick={() => {
                  const blob = new Blob([sharedCompanyCsv(c, txns, docs)], { type: "text/csv" });
                  downloadBlob(blob, `${c.company_name.replace(/[^\w-]+/g, "_")}.csv`);
                }}>Download CSV</Button>
                <Button size="sm" variant="outline" onClick={async () => {
                  const blob = await sharedCompanyPdf(c, txns, docs);
                  downloadBlob(blob, `${c.company_name.replace(/[^\w-]+/g, "_")}.pdf`);
                }}>Download PDF</Button>
                <Button size="sm" variant="outline" onClick={async()=>{try{downloadBlob(await sharedCompanyExcel(c,txns,docs),`${c.company_name.replace(/[^\w-]+/g,'_')}.xlsx`);}catch{toast.error('Could not create the company Excel file');}}}>Download Excel</Button>
                {c.can_write && (
                  <Button size="sm" variant="outline" onClick={() => document.getElementById(`shared-upload-${c.grant_id}`)?.click()}>Add document</Button>
                )}
                {c.can_write && (
                  <input id={`shared-upload-${c.grant_id}`} type="file" className="hidden" aria-label={`Add a document to ${c.company_name}`} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(c, f); e.target.value = ""; }} />
                )}
              </div>
              {t.slice(0, 100).map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{r.title}<span className="block text-xs text-muted-foreground">{r.expense_date} · {r.category}</span></span>
                  <span className="flex items-center gap-1 tabular-nums">₹{Number(r.amount).toLocaleString("en-IN")}
                    {c.can_write && <Button size="sm" variant="ghost" aria-label={`Edit description of ${r.title}`} onClick={() => setEditing({ id: r.id, title: r.title, company: c.company_name })}>Edit</Button>}
                  </span>
                </div>
              ))}
              {d.map((r) => <div key={r.id} className="flex items-center justify-between gap-2"><span className="truncate">{r.title}<span className="block text-xs text-muted-foreground">{r.doc_type}{r.doc_date ? ` · ${r.doc_date}` : ""}</span></span><Button size="sm" variant="outline" onClick={async () => { const u = await signedUrl(r.file_path); if (u) window.open(u, "_blank", "noopener"); else toast.error("Could not open this file"); }}>Open</Button><Button size="sm" variant="outline" aria-label={`Download ${r.title}`} onClick={async () => { try { await downloadFile(r.file_path, r.file_name || r.title, { size: r.size_bytes, mimeType: r.mime_type }); } catch (e) { toast.error((e as Error).message); } }}>Download</Button></div>)}
            </div>
          </details>
        );
      })}
      <ValueDialog
        open={!!editing}
        title="Edit entry description"
        description={`Changes the description of this entry in ${editing?.company ?? "the company"}'s records (shared with you to edit). The amount, date and category stay as they are.`}
        label="Description"
        initialValue={editing?.title ?? ""}
        confirmLabel="Save description"
        validate={requiredText("Write a description")}
        onSubmit={async (v) => { if (editing && v !== editing.title) await rename(editing.id, v.trim()); }}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
