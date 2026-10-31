import { useState } from "react";
import { toast } from "sonner";
import { Bookmark, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

const BASE = { scope: "all", memberId: "all", category: "all" };
const clean = (f: object) => Object.fromEntries(Object.entries(f).filter(([, v]) => typeof v === "string" && v !== "" && v !== "all")) as Record<string, string>;

/** One-tap reuse of common Transactions searches, saved to the owner's preferences. */
export function SavedViews({ filters, onApply }: { filters: object; onApply: (f: Record<string, string>) => void }) {
  const { preferences, savePreferences } = useStore();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const views = preferences.savedViews ?? [];
  const current = clean(filters);
  const same = (a: Record<string, string>) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(current).sort());
  const save = async () => {
    const n = name.trim();
    if (!n) return;
    if (views.some((v) => v.name.toLowerCase() === n.toLowerCase())) { toast.error("A view with that name already exists"); return; }
    await savePreferences({ ...preferences, savedViews: [...views, { id: crypto.randomUUID(), name: n, filters: current }] });
    setNaming(false); setName(""); toast.success(`Saved "${n}"`);
  };
  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Saved views">
        {views.map((v) => (
          <span key={v.id} className={"inline-flex items-center rounded-full border text-sm " + (same(v.filters) ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>
            <button type="button" className="py-1 pl-3 pr-1 font-medium" aria-pressed={same(v.filters)} onClick={() => onApply({ ...BASE, ...v.filters })}>{v.name}</button>
            <button type="button" className="rounded-full p-1 pr-2 opacity-70" aria-label={`Remove view ${v.name}`} onClick={() => void savePreferences({ ...preferences, savedViews: views.filter((x) => x.id !== v.id) })}><X className="h-3.5 w-3.5" /></button>
          </span>
        ))}
        {!naming && Object.keys(current).length > 0 && !views.some((v) => same(v.filters)) && (
          <Button variant="ghost" size="sm" onClick={() => setNaming(true)}><Bookmark className="mr-1 h-4 w-4" />Save this view</Button>
        )}
      </div>
      {naming && (
        <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <Input autoFocus aria-label="View name" placeholder="e.g. Business fuel this year" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" disabled={!name.trim()}>Save</Button>
          <Button type="button" variant="ghost" onClick={() => setNaming(false)}>Cancel</Button>
        </form>
      )}
    </div>
  );
}
