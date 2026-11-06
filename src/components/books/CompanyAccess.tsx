import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store";
import { companyDocuments, type EntityAccounts } from "@/lib/books/entity-accounts";
import { confirmAction } from "@/lib/confirm";
import { filterShared, rowsFor, sharedCompanyCsv, sharedCompanyPdf, type SharedCompany, type SharedDoc, type SharedTxn } from "@/lib/books/shared-company";

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
              const { error } = await supabase.rpc("revoke_entity_access", { _id: g.id });
              if (error) toast.error(error.message); else { toast.success("Access removed"); void load(); }
            }}>Remove</Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Input aria-label={`Email to share ${entityName}`} type="email" placeholder="accountant@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          {([false, true] as const).map((w) => (
            <Button key={String(w)} variant="outline" disabled={!email.includes("@")} onClick={async () => {
              if (w && !(await confirmAction(`Let ${email} change ${entityName}'s entries?`))) return;
              const { error } = await supabase.rpc("grant_entity_access", { _entity: entityId, _email: email, _write: w });
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
  const { signedUrl } = useStore();
  const [companies, setCompanies] = useState<SharedCompany[] | null>(null);
  const [txns, setTxns] = useState<SharedTxn[]>([]);
  const [docs, setDocs] = useState<SharedDoc[]>([]);
  const load = useCallback(async () => {
    const { data: cs } = await supabase.rpc("my_shared_companies");
    const list = (cs ?? []) as SharedCompany[];
    setCompanies(list);
    if (!list.length) { setTxns([]); setDocs([]); return; }
    const ids = [...new Set(list.map((c) => c.entity_id))], owners = [...new Set(list.map((c) => c.owner_id))];
    const [t, d] = await Promise.all([
      supabase.from("expenses").select("id,employee_id,entity_id,title,merchant,category,amount,currency,expense_date,txn_type").in("employee_id", owners).in("entity_id", ids).order("expense_date", { ascending: false }).limit(1000),
      supabase.from("documents").select("id,owner_id,entity_id,title,doc_type,doc_date,file_path").in("owner_id", owners).in("entity_id", ids).order("created_at", { ascending: false }).limit(500),
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
    const path = `${c.owner_id}/docs/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_").slice(0, 80)}`;
    const up = await supabase.storage.from("receipts").upload(path, file, { contentType: file.type || "application/octet-stream" });
    if (up.error) { toast.error("Couldn't upload — you may only have view access"); return; }
    const { error } = await supabase.from("documents").insert({
      owner_id: c.owner_id, entity_id: c.entity_id, title: file.name.replace(/\.[^.]+$/, ""), doc_type: "other",
      file_path: path, file_name: file.name.slice(0, 200), mime_type: file.type || "application/octet-stream", size_bytes: file.size,
    });
    if (error) { await supabase.storage.from("receipts").remove([path]); toast.error("Couldn't save the document"); return; }
    toast.success("Document added to the shared company"); void load();
  };
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <p className="font-semibold">Shared with you</p>
      <p className="text-xs text-muted-foreground">Companies other people gave you access to. Never added to your own records or totals.</p>
      {companies.map((c) => {
        const t = rowsFor(txns, c, (r) => r.employee_id), d = rowsFor(docs, c, (r) => r.owner_id);
        return (
          <details key={c.grant_id} className="rounded-xl border p-3 text-sm">
            <summary className="cursor-pointer"><span className="font-medium">{c.company_name}</span> <span className="text-xs text-muted-foreground">· {c.owner_email} · {c.can_write ? "Can edit" : "View only"} · {t.length} entries · {d.length} documents</span></summary>
            <div className="mt-3 space-y-2">
              <Button size="sm" variant="outline" onClick={() => {
                const blob = new Blob([sharedCompanyCsv(c, txns, docs)], { type: "text/csv" });
                const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${c.company_name.replace(/[^\w-]+/g, "_")}.csv`; a.click(); URL.revokeObjectURL(a.href);
              }}>Download CSV</Button>
              {t.slice(0, 100).map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{r.title}<span className="block text-xs text-muted-foreground">{r.expense_date} · {r.category}</span></span>
                  <span className="flex items-center gap-1 tabular-nums">₹{Number(r.amount).toLocaleString("en-IN")}
                    {c.can_write && <Button size="sm" variant="ghost" onClick={() => { const v = window.prompt("Description", r.title); if (v && v.trim() && v !== r.title) void rename(r.id, v.trim()); }}>Edit</Button>}
                  </span>
                </div>
              ))}
              {d.map((r) => <div key={r.id} className="flex items-center justify-between gap-2"><span className="truncate">{r.title}<span className="block text-xs text-muted-foreground">{r.doc_type}{r.doc_date ? ` · ${r.doc_date}` : ""}</span></span><Button size="sm" variant="outline" onClick={async () => { const u = await signedUrl(r.file_path); if (u) window.open(u, "_blank", "noopener"); else toast.error("Could not open this file"); }}>Open</Button></div>)}
            </div>
          </details>
        );
      })}
    </div>
  );
}
