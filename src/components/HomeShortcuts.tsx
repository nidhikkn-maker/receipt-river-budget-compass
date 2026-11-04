import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { setPendingScan } from "@/lib/pending-scan";
import { queueOfflineScan } from "@/lib/offline-scan";
import { cameraBlocked } from "@/lib/camera-check";
import { Plane, ScanLine, Inbox, Search, CalendarClock, FileText, Plus, Wallet, CreditCard, HandCoins, ChartPie, Sparkles, TrendingUp, FolderOpen, ArrowUp, ArrowDown, Settings2, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useStore } from "@/lib/store";
import { SHORTCUTS, DEFAULT_SHORTCUTS, moveShortcut, primaryShortcuts, type ShortcutId } from "@/lib/home-shortcuts";
import { CreateTripDialog } from "@/components/trip/CreateTripDialog";

const ICONS = { scan: ScanLine, expense: Plus, inbox: Inbox, travel: Plane, "upcoming-trips": CalendarClock, "create-trip": Plus, search: Search, payments: CalendarClock, accounts: Wallet, cards: CreditCard, reimbursements: HandCoins, budgets: ChartPie, reports: FileText, insights: TrendingUp, assistant: Sparkles, wealth: Wallet, documents: FolderOpen };
export function HomeShortcuts() {
  const { userId, preferences, savePreferences } = useStore();
  const [open, setOpen] = useState(false), [all, setAll] = useState(false), [create, setCreate] = useState(false);
  const [selected, setSelected] = useState<ShortcutId[]>([]);
  const [drag, setDrag] = useState<ShortcutId | null>(null);
  const navigate = useNavigate();
  const shown = all ? preferences.homeShortcuts : primaryShortcuts(preferences.homeShortcuts);
  const actionClass = "h-20 w-full min-w-0 flex-col gap-2 whitespace-normal rounded-lg border text-center text-xs";
  return <section aria-label="Home shortcuts" className="mb-5">
    <div className="mb-2 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">Shortcuts</h2><div className="flex gap-1">
      {preferences.homeShortcuts.length > 6 && <Button size="sm" variant="ghost" onClick={() => setAll((v) => !v)}>{all ? "Show less" : "View all"}</Button>}
      <Button size="icon" variant="ghost" aria-label="Configure shortcuts" title="Configure shortcuts" onClick={() => { setSelected([...preferences.homeShortcuts]); setOpen(true); }}><Settings2 className="h-4 w-4" /></Button>
    </div></div>
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">{shown.map((id) => {
      const s = SHORTCUTS.find((x) => x.id === id); if (!s) return null; const Icon = ICONS[id];
      if (id === "create-trip") return <Button key={id} variant="outline" className={actionClass} onClick={() => setCreate(true)}><Icon className="h-5 w-5 text-primary" />{s.label}</Button>;
      if (id === "scan") return <Button key={id} asChild variant="outline" className={actionClass}><label className="cursor-pointer" onClick={async (e) => { if (e.target !== e.currentTarget && (e.target as HTMLElement).tagName === "INPUT") return; const why = await cameraBlocked(); if (why) { e.preventDefault(); toast.message(why, { description: "Opening the expense form instead — you can attach a photo there." }); void navigate({ to: "/new" }); } }}><input type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Take a photo of a receipt" onChange={async (e) => { const files = Array.from(e.target.files ?? []); e.target.value = ""; if (!files.length) return; if (!navigator.onLine) { try { await queueOfflineScan(userId, files); toast.success("Receipt saved on this phone", { description: "It will upload and be read automatically when you're back online." }); } catch { toast.error("Couldn't save the photo on this phone"); } return; } setPendingScan(files); void navigate({ to: "/new", search: { scan: true } as never }); }} /><Icon className="h-5 w-5 text-primary" /><span>{s.label}</span></label></Button>;
      return <Button key={id} asChild variant="outline" className={actionClass}><Link to={s.to} {...(id === "upcoming-trips" ? { search: { status: "upcoming" } } : {})}><Icon className="h-5 w-5 text-primary" /><span>{s.label}</span></Link></Button>;
    })}</div>
    <Sheet open={open} onOpenChange={setOpen}><SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto" aria-describedby={undefined} onOpenAutoFocus={(e) => e.preventDefault()}><SheetHeader><SheetTitle>Home shortcuts</SheetTitle></SheetHeader>
      <div className="my-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setSelected([])}>Clear selection</Button><Button size="sm" variant="outline" onClick={() => setSelected([...DEFAULT_SHORTCUTS])}>Restore defaults</Button></div>
      {selected.length > 0 && <ol className="mb-4 divide-y">{selected.map((id, index) => <li key={id} draggable onDragStart={() => setDrag(id)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (drag) setSelected(moveShortcut(selected, drag, index)); setDrag(null); }} className="flex min-h-11 items-center gap-2 text-sm"><GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1">{index + 1}. {SHORTCUTS.find((s) => s.id === id)?.label}</span><Button size="icon" variant="ghost" disabled={index === 0} aria-label={`Move ${SHORTCUTS.find((s) => s.id === id)?.label} up`} title="Move up" onClick={() => setSelected(moveShortcut(selected, id, index - 1))}><ArrowUp className="h-4 w-4" /></Button><Button size="icon" variant="ghost" disabled={index === selected.length - 1} aria-label={`Move ${SHORTCUTS.find((s) => s.id === id)?.label} down`} title="Move down" onClick={() => setSelected(moveShortcut(selected, id, index + 1))}><ArrowDown className="h-4 w-4" /></Button></li>)}</ol>}
      {[...new Set(SHORTCUTS.map((s) => s.group))].map((group) => <div key={group} className="mb-4"><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">{group}</h3><Button size="sm" variant="ghost" onClick={() => setSelected([...new Set([...selected, ...SHORTCUTS.filter((s) => s.group === group).map((s) => s.id)])])}>Select all</Button></div><div className="grid grid-cols-2 gap-3">{SHORTCUTS.filter((s) => s.group === group).map((s) => <label key={s.id} className="flex items-center gap-2 text-sm"><Checkbox checked={selected.includes(s.id)} onCheckedChange={(v) => setSelected(v ? [...selected, s.id] : selected.filter((id) => id !== s.id))} />{s.label}</label>)}</div></div>)}
      <Button className="w-full" onClick={async () => { try { await savePreferences({ ...preferences, homeShortcuts: selected }); setOpen(false); toast.success("Shortcuts saved"); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save shortcuts"); } }}>Save shortcuts</Button>
    </SheetContent></Sheet>
    <CreateTripDialog open={create} onOpenChange={setCreate} />
  </section>;
}