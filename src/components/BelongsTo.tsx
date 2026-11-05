import { useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { emptyBooks } from "@/lib/books/types";
import { linkAccounts, ownerOf, stubEntity } from "@/lib/books/entity-accounts";

/** "Belongs to" picker on an account: personal, an existing company, or a new company created with just a name. */
export function BelongsTo({ accountId, compact }: { accountId: string; compact?: boolean }) {
  const { preferences, savePreferences } = useStore();
  const books = preferences.books ?? emptyBooks();
  const list = preferences.entities ?? [];
  const links = books.entityAccounts ?? {};
  const owner = ownerOf(links, accountId);
  const [busy, setBusy] = useState(false);
  const set = async (v: string) => {
    setBusy(true);
    try {
      let entities = list; let target: string | null = v || null;
      if (v === "__new") {
        const name = window.prompt("Company name (you can fill the rest later)") ?? null;
        if (name === null) return;
        const e = stubEntity(name); entities = [...list, e]; target = e.id;
      }
      await savePreferences({ ...preferences, entities, books: { ...books, entityAccounts: linkAccounts(links, target, [accountId]) } });
      toast.success(target ? "Linked to company" : "Marked personal");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <label className={`flex items-center gap-2 ${compact ? "text-xs" : "text-sm"}`}>
      <span className="text-muted-foreground">Belongs to</span>
      <select disabled={busy} aria-label="Belongs to" className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1" value={owner ?? ""} onChange={(e) => void set(e.target.value)}>
        <option value="">Me (personal)</option>
        {list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        <option value="__new">+ New company…</option>
      </select>
    </label>
  );
}
