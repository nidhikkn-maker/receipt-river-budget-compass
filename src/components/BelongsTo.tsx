import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { emptyBooks } from "@/lib/books/types";
import { affectedByMove, linkAccounts, ownerOf, stubEntity } from "@/lib/books/entity-accounts";
import { ENTITY_KINDS, type EntityKind } from "@/lib/entities";
import { confirmAction } from "@/lib/confirm";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

/** "Belongs to" on an account: personal, an existing company, or create one inline (nothing required). */
export function BelongsTo({ accountId }: { accountId: string }) {
  const { preferences, savePreferences, accounts, transactions } = useStore();
  const books = preferences.books ?? emptyBooks();
  const list = preferences.entities ?? [];
  const links = books.entityAccounts ?? {};
  const owner = ownerOf(links, accountId);
  const acct = accounts.find((a) => a.id === accountId);
  const holder = (acct?.details as { holder?: string } | undefined)?.holder ?? "";
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState(holder);
  const [kind, setKind] = useState<EntityKind>("company");
  const nameOf = (id: string | null) => (id ? list.find((x) => x.id === id)?.name ?? "a company" : "Personal");

  const apply = async (target: string | null, newEntity?: ReturnType<typeof stubEntity>) => {
    const n = affectedByMove(transactions, accountId);
    const toName = newEntity ? newEntity.name : nameOf(target);
    if (owner !== target && !(await confirmAction({ title: `Move ${acct?.name ?? "account"} to ${toName}?`, message: `Moving from ${nameOf(owner)}. ${n} past ${n === 1 ? "entry" : "entries"} will count for ${toName}; entries you changed by hand keep their company. Balances don't change.`, confirmLabel: "Move" }))) return;
    setBusy(true);
    try {
      await savePreferences({ ...preferences, entities: newEntity ? [...list, newEntity] : list, books: { ...books, entityAccounts: linkAccounts(links, target, [accountId]) } });
      if (newEntity) window.__lovableEvents?.track?.("project.company_created", { source: "account_settings", kind: newEntity.kind });
      window.__lovableEvents?.track?.("project.account_company_linked", { action: !target ? "unlink" : owner ? "move" : "link", source: "account_settings" });
      toast.success(target ? `Linked to ${toName}` : "Marked personal");
      setCreating(false);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Belongs to</span>
        <select disabled={busy} aria-label="Belongs to" className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1" value={owner ?? ""} onChange={(e) => { if (e.target.value === "__new") { setName(holder); setCreating(true); } else void apply(e.target.value || null); }}>
          <option value="">Me (personal)</option>
          {list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          <option value="__new">+ New company…</option>
        </select>
        <Button size="sm" variant="outline" onClick={() => { setName(holder); setCreating((v) => !v); }}>Create company</Button>
        {owner && <Link to="/entities" className="text-xs font-medium text-primary underline">Open company</Link>}
      </div>
      {creating && (
        <div className="grid gap-2 rounded-xl border p-3">
          <p className="text-xs text-muted-foreground">Everything is optional — fill in PAN, GST and the rest later on Companies & years.</p>
          <Input aria-label="Company name" placeholder="Company name" value={name} onChange={(e) => setName(e.target.value)} />
          <select aria-label="Company type" className="rounded-md border bg-background px-2 py-2 text-sm" value={kind} onChange={(e) => setKind(e.target.value as EntityKind)}>
            {(["company", "llp", "partnership", "proprietorship", "trust", "huf"] as EntityKind[]).map((k) => <option key={k} value={k}>{ENTITY_KINDS[k].label}</option>)}
          </select>
          <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => { const e = stubEntity(name, kind); void apply(e.id, e); }}>Create & link</Button><Button size="sm" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button></div>
        </div>
      )}
    </div>
  );
}
