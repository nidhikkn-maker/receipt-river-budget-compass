import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store";
import { companyDocuments, type EntityAccounts } from "@/lib/books/entity-accounts";
import { confirmAction } from "@/lib/confirm";

type Grant = { id: string; member_email: string; created_at: string };

/** Owner-side: who may read this company's tagged documents, and which documents are tagged. Enforced in the database, not here. */
export function CompanyAccess({ entityId, entityName, links }: { entityId: string; entityName: string; links: EntityAccounts }) {
  const { documents, updateDocument, userId } = useStore();
  const [grants, setGrants] = useState<Grant[]>([]);
  const [email, setEmail] = useState("");
  const load = useCallback(async () => {
    const { data } = await supabase.from("entity_members").select("id,member_email,created_at").eq("owner_id", userId).eq("entity_id", entityId).is("revoked_at", null).order("created_at");
    setGrants(data ?? []);
  }, [entityId, userId]);
  useEffect(() => { void load(); }, [load]);
  const { tagged, suggested } = companyDocuments(documents, links, entityId);
  const tag = async (ids: string[], value: string | null) => { for (const id of ids) await updateDocument(id, { entityId: value }); toast.success(value ? `${ids.length} document(s) tagged to ${entityName}` : "Removed from company"); };
  return (
    <details className="rounded-xl border p-3 text-sm">
      <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Access & documents · {grants.length} people · {tagged.length} documents</summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-muted-foreground">People you add can view only documents tagged to {entityName}. Your personal and other companies' records stay private. They cannot change anything.</p>
        {grants.map((g) => (
          <div key={g.id} className="flex items-center justify-between gap-2 rounded-lg bg-secondary/50 px-3 py-1.5">
            <span className="truncate">{g.member_email}</span>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => {
              if (!(await confirmAction(`Remove ${g.member_email}'s access to ${entityName}?`))) return;
              const { error } = await supabase.rpc("revoke_entity_access", { _id: g.id });
              if (error) toast.error(error.message); else { toast.success("Access removed"); void load(); }
            }}>Remove</Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Input aria-label={`Email to share ${entityName}`} type="email" placeholder="accountant@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button variant="outline" disabled={!email.includes("@")} onClick={async () => {
            const { error } = await supabase.rpc("grant_entity_access", { _entity: entityId, _email: email, _write: false });
            if (error) toast.error(error.message); else { toast.success("View access given"); setEmail(""); void load(); }
          }}>Give view access</Button>
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

type Shared = { id: string; title: string; doc_type: string; doc_date: string | null; file_path: string };

/** Member-side: documents other owners shared with you through a company grant. */
export function SharedWithMe() {
  const { userId, signedUrl } = useStore();
  const [docs, setDocs] = useState<Shared[] | null>(null);
  useEffect(() => { void supabase.from("documents").select("id,title,doc_type,doc_date,file_path").neq("owner_id", userId).order("created_at", { ascending: false }).limit(200).then(({ data }) => setDocs(data ?? [])); }, [userId]);
  if (!docs?.length) return null;
  return (
    <div className="space-y-2 rounded-2xl border bg-card p-4">
      <p className="font-semibold">Shared with you</p>
      <p className="text-xs text-muted-foreground">Company documents other people gave you view access to. Not added to your own records.</p>
      {docs.map((d) => <div key={d.id} className="flex items-center justify-between gap-2 text-sm"><span className="truncate">{d.title}<span className="block text-xs text-muted-foreground">{d.doc_type}{d.doc_date ? ` · ${d.doc_date}` : ""}</span></span><Button size="sm" variant="outline" onClick={async () => { const u = await signedUrl(d.file_path); if (u) window.open(u, "_blank", "noopener"); else toast.error("Could not open this file"); }}>Open</Button></div>)}
    </div>
  );
}
