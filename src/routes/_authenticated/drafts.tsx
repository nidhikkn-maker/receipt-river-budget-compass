import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileText, Plus, RotateCcw, Trash2 } from "lucide-react";
import { PageTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DRAFT_STATUS_LABEL, deleteDraft, draftThumb, listDrafts, localAsDraft, pendingDrafts, syncLocalDrafts, type Draft } from "@/lib/drafts";
import { localDrafts, removeLocalDraft } from "@/lib/offline";
import { useStore } from "@/lib/store";
import { SCOPE_LABEL, money } from "@/lib/expenses";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/drafts")({
  head: () => ({ meta: [
    { title: "Drafts — Ledgerline" },
    { name: "description", content: "Unfinished expenses and captured receipts waiting to be completed." },
    { property: "og:title", content: "Drafts — Ledgerline" },
    { property: "og:description", content: "Unfinished expenses and captured receipts waiting to be completed." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: DraftsPage,
});

function Thumb({ d }: { d: Draft }) {
  const r = d.receipts[0];
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { if (r?.path && r.type.startsWith("image/") && navigator.onLine) void draftThumb(r).then(setUrl); }, [r?.path]);
  return url ? <img src={url} alt="" className="h-14 w-12 shrink-0 rounded-lg border object-cover" /> : <span className="flex h-14 w-12 shrink-0 items-center justify-center rounded-lg border bg-muted"><FileText className="h-5 w-5 text-muted-foreground" /></span>;
}

function DraftsPage() {
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<Draft[] | null>(null);
  const { userId } = useStore();
  const load = async () => {
    const local = (await localDrafts(userId).catch(() => [])).map(localAsDraft);
    let server: Draft[] = [];
    if (navigator.onLine) { try { server = pendingDrafts(await listDrafts()); setError(""); } catch (e) { setError((e as Error).message); } }
    else setError("You're offline — showing drafts saved on this device.");
    const ids = new Set(local.map((d) => d.id));
    setDrafts([...local, ...server.filter((d) => !ids.has(d.id))].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  };
  useEffect(() => {
    void load().then(() => syncLocalDrafts(userId)).then((n) => { if (n) void load(); });
    const on = () => void syncLocalDrafts(userId).then(load); const off = () => void load();
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  const remove = async (list: Draft[]) => {
    let failed = 0;
    for (const d of list) {
      try {
        await removeLocalDraft(userId, d.id);
        if (!d.localOnly || navigator.onLine) await deleteDraft({ id: d.id, receipts: d.receipts.filter((r) => r.path) }).catch((e) => { if (!d.localOnly) throw e; });
      } catch { failed++; }
    }
    setConfirm(null); setPicked([]); await load();
    failed ? toast.error(`${failed} draft${failed === 1 ? "" : "s"} couldn't be deleted`) : toast.success(list.length === 1 ? "Draft deleted" : `${list.length} drafts deleted`);
  };
  return (
    <>
      <PageTitle eyebrow="Activity" title="Drafts" sub="Unfinished expenses. They don't count toward balances, budgets or reports until you save them." />
      {error && <p role="alert" className="mb-3 text-sm text-muted-foreground">{error} <button className="underline" onClick={() => void load()}>Retry</button></p>}
      {drafts === null && !error && <p role="status" className="text-sm text-muted-foreground">Loading drafts…</p>}
      {drafts?.length === 0 && <div className="rounded-3xl border bg-card p-6 text-center text-sm text-muted-foreground">No drafts. Scan a receipt and tap <b>Resume later</b> to finish it here.<div className="mt-3"><Button asChild variant="gold"><Link to="/new"><Plus className="h-4 w-4" />Add expense</Link></Button></div></div>}
      {!!drafts?.length && (
        <>
          <div className="mb-2 flex items-center gap-2 text-sm">
            <Checkbox aria-label="Select all drafts" checked={picked.length === drafts.length} onCheckedChange={(v) => setPicked(v ? drafts.map((d) => d.id) : [])} />
            <span className="text-muted-foreground">{picked.length ? `${picked.length} selected` : `${drafts.length} waiting`}</span>
            {picked.length > 0 && <Button size="sm" variant="outline" className="ml-auto" onClick={() => setConfirm(drafts.filter((d) => picked.includes(d.id)))}><Trash2 className="h-4 w-4" />Delete selected</Button>}
          </div>
          <ul className="grid gap-2">
            {drafts.map((d) => {
              const x = d.data; const amt = Number(x.amount);
              return (
                <li key={d.id} className="flex items-center gap-3 rounded-2xl border bg-card p-3">
                  <Checkbox aria-label="Select draft" checked={picked.includes(d.id)} onCheckedChange={(v) => setPicked((p) => (v ? [...p, d.id] : p.filter((i) => i !== d.id)))} />
                  <Thumb d={d} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{x.merchant || x.title || (d.receipts.length ? "Captured receipt" : "Unfinished entry")}</p>
                    <p className="truncate text-xs text-muted-foreground">{amt > 0 ? money(amt, x.currency || "INR") : "No amount yet"} · {new Date(d.createdAt).toLocaleDateString()}{x.scope ? ` · ${SCOPE_LABEL[x.scope as keyof typeof SCOPE_LABEL] ?? x.scope}` : ""}</p>
                    <span className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold", d.status === "failed" ? "bg-destructive/15 text-destructive" : d.status === "ready" ? "bg-primary/15 text-primary" : "bg-secondary")}>{DRAFT_STATUS_LABEL[d.status]}</span>
                    <span className="ml-1 text-[10px] text-muted-foreground">{d.localOnly ? "Only on this device · waiting to sync" : "Synced to your account"}</span>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <Button asChild size="sm"><Link to="/new" search={{ draft: d.id }}>Resume</Link></Button>
                    {d.receipts.length > 0 && (d.status === "failed" || d.status === "info_required") && <Button asChild size="sm" variant="outline"><Link to="/new" search={{ draft: d.id, retry: true }}><RotateCcw className="h-3.5 w-3.5" />Retry</Link></Button>}
                    <Button size="sm" variant="ghost" aria-label="Delete draft" onClick={() => setConfirm([d])}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm && confirm.length > 1 ? `Delete ${confirm.length} drafts?` : "Delete this draft?"}</AlertDialogTitle>
            <AlertDialogDescription>Delete {confirm && confirm.length > 1 ? "these unfinished expenses and their" : "this unfinished expense and its"} attached receipt? This can't be undone. Saved transactions aren't affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); return confirm ? remove(confirm) : undefined; }}>Delete draft</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
