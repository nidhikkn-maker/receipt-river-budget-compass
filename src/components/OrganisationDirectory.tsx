// Organisation directory (Version 4.9): organisations are the shared "Organisation" tag group,
// so claims, reports and entries all reuse the same records. Used ones can't be deleted.
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { organisationUsage } from "@/lib/master-data";

export function OrganisationDirectory() {
  const { preferences: p, savePreferences, transactions } = useStore();
  const [name, setName] = useState("");
  const list = useMemo(() => organisationUsage(p.tags, transactions), [p.tags, transactions]);
  const add = async () => {
    const n = name.trim();
    if (list.some((o) => o.name.toLowerCase() === n.toLowerCase())) { toast.error(`“${n}” is already in your organisations`); return; }
    await savePreferences({ ...p, tags: [...p.tags, { group: "Organisation", name: n }] }); setName(""); toast.success("Organisation saved");
  };
  return (
    <section id="organisations" className="mb-6 scroll-mt-20 rounded-3xl border bg-card p-5">
      <h2 className="font-display text-lg font-bold">Organisations</h2>
      <p className="mb-3 text-sm text-muted-foreground">Employers, clients and companies reused in entries, claims and reports.</p>
      <div className="mb-3 flex gap-2"><Input aria-label="New organisation" maxLength={24} placeholder="Organisation name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button size="icon" aria-label="Add organisation" disabled={!name.trim()} onClick={() => void add().catch((e: Error) => toast.error(e.message))}><Plus /></Button></div>
      {list.length ? <ul className="divide-y">{list.map((o) => (
        <li key={o.name} className="flex items-center justify-between py-1.5 text-sm"><span>{o.name} <span className="text-xs text-muted-foreground">· {o.uses} {o.uses === 1 ? "entry" : "entries"}</span></span>
          <Button variant="ghost" size="icon" disabled={o.uses > 0} title={o.uses ? "In use by entries — kept for history" : undefined} aria-label={`Remove ${o.name}`}
            onClick={() => void savePreferences({ ...p, tags: p.tags.filter((t) => !(t.group === "Organisation" && t.name === o.name)) }).catch((e: Error) => toast.error(e.message))}><Trash2 className="h-4 w-4" /></Button></li>
      ))}</ul> : <p className="text-sm text-muted-foreground">No organisations yet.</p>}
    </section>
  );
}
