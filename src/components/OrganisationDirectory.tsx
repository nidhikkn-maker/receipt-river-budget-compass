// Organisation directory (Version 4.9): organisations are the shared "Organisation" tag group,
// so claims, reports and entries all reuse the same records. Used ones can't be deleted.
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { organisationUsage, renameTagIn } from "@/lib/master-data";
import { Pencil } from "lucide-react";

export function OrganisationDirectory() {
  const { preferences: p, savePreferences, transactions, setTags } = useStore();
  const rename = async (old: string) => {
    const n = window.prompt(`Rename “${old}” to`, old)?.trim().slice(0, 24);
    if (!n || n === old) return;
    if (list.some((o) => o.name.toLowerCase() === n.toLowerCase() && o.name !== old)) { toast.error(`“${n}” already exists`); return; }
    await savePreferences({ ...p, tags: p.tags.map((t) => (t.group === "Organisation" && t.name === old ? { ...t, name: n } : t)), reimbursementSettings: { ...p.reimbursementSettings, profiles: p.reimbursementSettings.profiles.map(r => r.organisation === old ? { ...r, organisation: n } : r), mappings: p.reimbursementSettings.mappings.map(m => m.organisation === old ? { ...m, organisation: n } : m), responsibilities: p.reimbursementSettings.responsibilities.map(r => ({ ...r, shares: r.shares.map(s => s.organisation === old ? { ...s, organisation: n } : s) })) } });
    const from = `Organisation: ${old}`, to = `Organisation: ${n}`;
    for (const e of transactions) if ((e.tags ?? []).includes(from)) await setTags(e.id, renameTagIn(e.tags ?? [], from, to));
    toast.success("Organisation renamed everywhere");
  };
  const [name, setName] = useState("");
  const list = useMemo(() => organisationUsage(p.tags, transactions).map(o => ({ ...o, uses: o.uses + p.reimbursementSettings.profiles.filter(r => r.organisation === o.name).length + p.reimbursementSettings.responsibilities.filter(r => r.shares.some(s => s.organisation === o.name)).length })), [p.tags, transactions, p.reimbursementSettings]);
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
          <span className="flex"><Button variant="ghost" size="icon" aria-label={`Rename ${o.name}`} onClick={() => void rename(o.name).catch((e: Error) => toast.error(e.message))}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" disabled={o.uses > 0} title={o.uses ? "In use by entries — kept for history" : undefined} aria-label={`Remove ${o.name}`}
            onClick={() => void savePreferences({ ...p, tags: p.tags.filter((t) => !(t.group === "Organisation" && t.name === o.name)) }).catch((e: Error) => toast.error(e.message))}><Trash2 className="h-4 w-4" /></Button></span></li>
      ))}</ul> : <p className="text-sm text-muted-foreground">No organisations yet.</p>}
    </section>
  );
}
