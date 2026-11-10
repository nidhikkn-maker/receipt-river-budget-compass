import { HomeModePicker } from "@/components/HomeModePicker";
import { HOME_SECTIONS, HOME_SECTION_LABEL } from "@/lib/preferences";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowUp, ArrowDown, Archive, Pencil, Plus, Merge, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { useStore } from "@/lib/store";
import { tagValue } from "@/lib/preferences";
import { LANGUAGES, type Language } from "@/lib/preferences";
import { Label } from "./ui/label";
import { CURRENCIES } from "@/lib/expenses";
import { CategoryMergePreview } from "./CategoryMergePreview";
import { ValueDialog } from "./ValueDialog";
import { categoryRenameProblem } from "@/lib/value-edits";

export function FinanceSettings() {
  const { preferences:p, savePreferences, moveCategory, name, updateName, loading }=useStore();
  const [displayName, setDisplayName] = useState(name);
  const [mergeSource, setMergeSource] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  // Same steps as before: move ledger and budget references (RLS-protected database function), then rename in the catalog.
  const renameCategory = async (old: string, value: string) => {
    const name = value.trim();
    if (!name || name === old) return;
    if (p.categories.some(x=>x.name===name)) throw Error("Use merge for an existing category");
    await moveCategory(old,name);
    await savePreferences({...p,budgets:p.budgets.map(b=>b.kind==="category"&&b.value===old?{...b,value:name}:b),categories:p.categories.map(x=>x.name===old?{...x,name}:x)});
    toast.success("Saved");
  };
  const [category,setCategory]=useState(""); const [tag,setTag]=useState(""); const [group,setGroup]=useState("Project");
  useEffect(()=>setDisplayName(name),[name]);
  const run=async(fn:()=>Promise<void>)=>{try{await fn();toast.success("Saved");}catch(e){toast.error((e as Error).message);}};
  if(loading)return <p role="status">Loading your settings…</p>;
  return <section className="mb-8 space-y-6">
    <ValueDialog
      open={renaming!==null}
      title={`Rename category “${renaming ?? ""}”`}
      description="Every entry, split and budget that uses this category moves to the new name. To combine it with a category you already have, use Merge instead."
      label="New category name"
      initialValue={renaming ?? ""}
      maxLength={60}
      confirmLabel="Rename category"
      validate={(v)=>categoryRenameProblem(v, renaming ?? "", p.categories.map(x=>x.name))}
      onSubmit={(v)=>renameCategory(renaming ?? "", v)}
      onClose={()=>setRenaming(null)}
    />
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-1"><Label htmlFor="display-name">Your name</Label><div className="flex gap-2"><Input id="display-name" value={displayName} onChange={e=>setDisplayName(e.target.value)} /><Button variant="outline" onClick={()=>run(()=>updateName(displayName))}>Save name</Button></div></div>
      <div className="grid gap-1"><Label>Default bill currency</Label><Select value={p.defaultCurrency} onValueChange={v=>run(()=>savePreferences({...p,defaultCurrency:v}))}><SelectTrigger aria-label="Default currency"><SelectValue /></SelectTrigger><SelectContent>{CURRENCIES.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
      <div className="grid gap-1"><Label>AI answer language</Label><Select value={p.language} onValueChange={v=>run(()=>savePreferences({...p,language:v as Language}))}><SelectTrigger aria-label="AI language"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(LANGUAGES).map(([v,label])=><SelectItem key={v} value={v}>{label}</SelectItem>)}</SelectContent></Select></div>
      <div className="grid gap-1"><Label htmlFor="trip-budget-warn">Trip budget warning at %</Label><Input id="trip-budget-warn" type="number" min="10" max="99" defaultValue={p.tripBudgetWarnPct} onBlur={e=>run(()=>savePreferences({...p,tripBudgetWarnPct:Math.min(99,Math.max(10,Math.round(Number(e.target.value)||80)))}))} /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.aiEnabled} onChange={e=>run(()=>savePreferences({...p,aiEnabled:!p.aiEnabled}))} />Allow AI assistance</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.aiReadsDocuments} onChange={e=>run(()=>savePreferences({...p,aiReadsDocuments:!p.aiReadsDocuments}))} />Allow AI to read uploaded documents</label>
    </div>
    <div><h2 className="mb-3 font-display text-xl font-bold">Categories</h2><div className="mb-3 flex gap-2"><Input aria-label="New category" value={category} onChange={e=>setCategory(e.target.value)} maxLength={60} placeholder="Category name"/><Button size="icon" aria-label="Add category" disabled={!category.trim()} onClick={()=>run(async()=>{if(p.categories.some(c=>c.name.toLowerCase()===category.trim().toLowerCase()))throw Error("Category already exists");await savePreferences({...p,categories:[...p.categories,{name:category.trim(),archived:false}]});setCategory("");})}><Plus/></Button></div>
    <ul className="divide-y">{p.categories.map((c,i)=><li key={c.name} className="flex items-center gap-1 py-2"><span className="min-w-0 flex-1 truncate text-sm">{c.name}{c.archived&&" · archived"}</span>
    <Button size="icon" variant="ghost" aria-label={`Move ${c.name} up`} disabled={i===0} onClick={()=>run(()=>{const cats=[...p.categories];const prior=cats[i-1];if(prior){cats[i-1]=c;cats[i]=prior;}return savePreferences({...p,categories:cats});})}><ArrowUp className="h-4 w-4"/></Button>
    <Button size="icon" variant="ghost" aria-label={`Rename ${c.name}`} onClick={()=>setRenaming(c.name)}><Pencil className="h-4 w-4"/></Button>
    <Button size="icon" variant="ghost" aria-label={`Merge ${c.name}`} onClick={()=>setMergeSource(c.name)}><Merge className="h-4 w-4"/></Button>
    <Button size="icon" variant="ghost" aria-label={`${c.archived?"Restore":"Archive"} ${c.name}`} onClick={()=>run(()=>savePreferences({...p,categories:p.categories.map(x=>x.name===c.name?{...x,archived:!x.archived}:x)}))}><Archive className="h-4 w-4"/></Button></li>)}</ul></div>
    <div><h2 className="mb-3 font-display text-xl font-bold">Grouped tags</h2><div className="grid grid-cols-[1fr_1fr_auto] gap-2"><Select value={group} onValueChange={setGroup}><SelectTrigger aria-label="Tag group"><SelectValue/></SelectTrigger><SelectContent>{["Person","Purpose","Organisation","Nature","Project"].map(g=><SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent></Select><Input value={tag} maxLength={24} aria-label="New tag" placeholder="Tag name" onChange={e=>setTag(e.target.value)}/><Button size="icon" aria-label="Add tag" disabled={!tag.trim()} onClick={()=>run(async()=>{if(p.tags.some(t=>t.group===group&&t.name===tag.trim()))throw Error("Tag already exists");await savePreferences({...p,tags:[...p.tags,{group,name:tag.trim()}]});setTag("");})}><Plus/></Button></div><ul className="mt-3 divide-y">{p.tags.map(t=><li key={tagValue(t)} className="flex items-center justify-between py-1 text-sm">{tagValue(t)}<Button variant="ghost" size="icon" aria-label={`Remove ${t.name}`} onClick={()=>run(()=>savePreferences({...p,tags:p.tags.filter(x=>tagValue(x)!==tagValue(t))}))}><Trash2 className="h-4 w-4"/></Button></li>)}</ul></div>
    <div><h2 className="mb-3 font-display text-xl font-bold">Home layout</h2><HomeModePicker/><Button variant="outline" size="sm" className="mb-2" onClick={()=>run(()=>savePreferences({...p,homeMode:"custom",homeOrder:[...HOME_SECTIONS],homeHidden:[]}))}>Restore default layout</Button>{p.homeOrder.map((section,i)=><div key={section} className="flex items-center justify-between gap-2 border-b py-1.5"><label className="flex min-w-0 items-center gap-2 text-sm"><input type="checkbox" checked={!p.homeHidden.includes(section)} onChange={e=>run(()=>savePreferences({...p,homeMode:"custom",homeHidden:e.target.checked?p.homeHidden.filter(x=>x!==section):[...p.homeHidden,section]}))}/>{HOME_SECTION_LABEL[section as keyof typeof HOME_SECTION_LABEL]??section}</label><div className="flex shrink-0 items-center"><Button variant="ghost" size="icon" disabled={i===0} aria-label={`Move ${section} up`} onClick={()=>run(()=>{const order=[...p.homeOrder];const prior=order[i-1];if(prior){order[i-1]=section;order[i]=prior;}return savePreferences({...p,homeMode:"custom",homeOrder:order});})}><ArrowUp className="h-4 w-4"/></Button><Button variant="ghost" size="icon" disabled={i===p.homeOrder.length-1} aria-label={`Move ${section} down`} onClick={()=>run(()=>{const order=[...p.homeOrder];const next=order[i+1];if(next){order[i+1]=section;order[i]=next;}return savePreferences({...p,homeMode:"custom",homeOrder:order});})}><ArrowDown className="h-4 w-4"/></Button></div></div>)}</div>
    {mergeSource && <CategoryMergePreview source={mergeSource} onClose={()=>setMergeSource(null)} />}
  </section>;
}
