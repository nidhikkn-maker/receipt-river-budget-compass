import { confirmAction } from "@/lib/confirm";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Trash2, Upload } from "lucide-react";
import { PageTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { PasskeySettings } from "@/components/DeviceLock";
import { FinanceSettings } from "@/components/FinanceSettings";
import { AppearanceSettings } from "@/components/AppearanceSettings";
import { PushSettings } from "@/components/PushSettings";
import { OrganisationDirectory } from "@/components/OrganisationDirectory";
import { ImportRules } from '@/components/ImportRules';
import { SettingsDirectory } from "@/components/SettingsDirectory";
import { useStore } from "@/lib/store";
import { BACKUP_TABLES, createBackupZip, prepareRestore, readBackup, type Backup } from "@/lib/backup";
import { downloadBlob } from "@/lib/reports";
import type { Json } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings & backup — Ledgerline" },
      { name: "description", content: "Back up, restore, export or delete your financial records." },
      { property: "og:title", content: "Settings & backup — Ledgerline" },
      { property: "og:description", content: "Back up, restore, export or delete your financial records." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Settings,
});

// Restore order matters: rows that others point to come first.
function Settings() {
  const { userId, name, deleteAll, refresh, transactions, accounts } = useStore();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const backup = async () => {
    setBusy(true);
    try {
      const out: Backup["data"] = {};
      for (const t of BACKUP_TABLES) {
        out[t] = [];
        for (let start = 0; ; start += 500) {
          const order = t === "finance_preferences" ? "owner_id" : t === "category_budgets" ? "category" : "id";
          const { data, error } = await supabase.from(t).select("*").order(order).range(start, start + 499);
          if (error) throw new Error(error.message);
          out[t]?.push(...(data ?? []));
          if (!data || data.length < 500) break;
        }
      }
      const paths = new Set<string>();
      for (const e of out.expenses ?? []) for (const r of (e["receipts"] ?? []) as { path: string }[]) paths.add(r.path);
      for (const d of out.documents ?? []) if (typeof d["file_path"] === "string") paths.add(d["file_path"]);
      const files: Record<string, Uint8Array> = {};
      let bytes = 0;
      for (const path of paths) {
        const { data, error } = await supabase.storage.from("receipts").download(path);
        if (error || !data) throw Error("Couldn't download one of your files. Backup stopped so nothing is silently omitted.");
        bytes += data.size;
        if (bytes > 140 * 1024 * 1024) throw Error("Files exceed the 140 MB backup limit");
        files[path] = new Uint8Array(await data.arrayBuffer());
      }
      const zip = createBackupZip({ app: "ledgerline", version: 2, owner: userId, name, exportedAt: new Date().toISOString(), data: out }, files);
      downloadBlob(new Blob([new Uint8Array(zip).buffer], { type: "application/zip" }), `ledgerline-backup-${new Date().toISOString().slice(0, 10)}.zip`);
      toast.success("Backup downloaded");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const restore = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    const staged: string[] = [];
    let committed = false;
    try {
      if (f.size > 150 * 1024 * 1024) throw Error("Backup must be under 150 MB");
      const { backup: j, files } = readBackup(new Uint8Array(await f.arrayBuffer()), /\.zip$/i.test(f.name));
      const { data: restored, paths } = prepareRestore(j, userId, undefined, true);
      if (!await confirmAction("Restore this backup into your account? Existing matching records will be updated.")) return;
      for (const [oldPath, newPath] of paths) {
        let bytes = files[oldPath];
        if (!bytes) {
          if (j.owner !== userId) throw Error("Choose a complete ZIP backup containing its receipt files.");
          const { data, error } = await supabase.storage.from("receipts").download(oldPath);
          if (error || !data) throw Error("This older backup doesn't contain its receipt files. Choose a complete ZIP backup.");
          bytes = new Uint8Array(await data.arrayBuffer());
        }
        const { error } = await supabase.storage.from("receipts").upload(newPath, new Uint8Array(bytes).buffer, { upsert: false });
        if (error) throw Error("Couldn't restore a file — please try again");
        staged.push(newPath);
      }
      const { data, error } = await supabase.rpc("restore_finance_backup", { payload: restored as Json, ...(j.name?.trim() ? { display_name: j.name.trim() } : {}) });
      if (error) throw Error("Restore stopped; your existing records are unchanged. Check the backup and try again.");
      committed = true;
      const counts = (data as { counts: Record<string, number> }).counts;
      const n = Object.values(counts).reduce((sum, count) => sum + count, 0);
      await refresh();
      toast.success(`Restored ${n} records`);
    } catch (e) { toast.error((e as Error).message); } finally {
      if (!committed) for (let i = 0; i < staged.length; i += 100) await supabase.storage.from("receipts").remove(staged.slice(i, i + 100));
      setBusy(false); if (file.current) file.current.value = "";
    }
  };

  const wipe = async () => {
    if (deleteConfirmation !== "DELETE" || busy) return;
    setDeleteError("");
    setBusy(true);
    try {
      await deleteAll();
      setDeleteOpen(false);
      setDeleteConfirmation("");
      toast.success("All records deleted");
    } catch (e) { setDeleteError(e instanceof Error ? e.message : "Couldn't delete your data. Please try again."); } finally { setBusy(false); }
  };

  return (
    <>
      <PageTitle eyebrow="Settings" title="Settings" sub={`${transactions.length} entries · ${accounts.length} accounts`} />
      <div className="mb-5"><Button asChild variant="outline"><Link to="/auth">Sign in / account</Link></Button></div>
      <SettingsDirectory />
      <div id="security" className="scroll-mt-20"><PasskeySettings /></div>
      <div id="appearance" className="scroll-mt-20"><AppearanceSettings /></div>
      <div id="finance" className="scroll-mt-20"><FinanceSettings /></div>
      <OrganisationDirectory />
      <ImportRules />
      <div id="notifications" className="scroll-mt-20"><PushSettings /></div>
      <div id="data" className="grid scroll-mt-20 gap-4 sm:grid-cols-2">
        <Card title="Back up everything" body="Accounts, entries, budgets, valuations, family and original receipt and document files.">
          <Button onClick={backup} disabled={busy}><Download className="h-4 w-4" />Download backup</Button>
        </Card>
        <Card title="Restore from a backup" body="Pick a Ledgerline backup file. Records are added back (or updated if they already exist).">
          <Button variant="secondary" onClick={() => file.current?.click()} disabled={busy}><Upload className="h-4 w-4" />Choose backup file</Button>
          <input ref={file} type="file" accept="application/zip,application/json,.zip,.json" className="sr-only" aria-label="Backup file" onChange={(e) => restore(e.target.files?.[0])} />
        </Card>
        <Card title="Payment methods" body="Your UPI IDs, debit and credit cards, wallets and cash, each linked to its bank account.">
          <Button asChild variant="secondary"><Link to="/payment-methods">Manage payment methods</Link></Button>
        </Card>
        <Card title="Connected assistants" body="See which AI assistants can read your records and remove their access at any time.">
          <Button asChild variant="secondary"><Link to="/assistants">Manage assistants</Link></Button>
        </Card>
        <Card title="Export reports" body="CSV and PDF reports of spending, by category, family member and business vs personal.">
          <Button asChild variant="secondary"><Link to="/reports">Open reports</Link></Button>
        </Card>
        <Card title="Delete all data" body="Removes financial records, receipts and documents in this account. Your sign-in account stays available. Download a backup first if you might need it.">
          <Button variant="destructive" onClick={() => { setDeleteConfirmation(""); setDeleteError(""); setDeleteOpen(true); }} disabled={busy}><Trash2 className="h-4 w-4" />Delete everything</Button>
        </Card>
      </div>
      <Dialog open={deleteOpen} onOpenChange={(open) => { if (!busy) setDeleteOpen(open); }}>
        <DialogContent onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onPointerDownOutside={(event) => { if (busy) event.preventDefault(); }}>
          <DialogHeader>
            <DialogTitle>Delete your financial data?</DialogTitle>
            <DialogDescription>This permanently removes your financial records across devices, including receipts, documents and saved reviews. Your sign-in account and name remain. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => { event.preventDefault(); void wipe(); }} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="delete-confirmation" className="text-sm font-semibold">Type DELETE to confirm</label>
              <Input id="delete-confirmation" autoComplete="off" autoCapitalize="characters" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} disabled={busy} />
            </div>
            {deleteError && <p role="alert" className="text-sm font-semibold text-destructive">{deleteError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setDeleteOpen(false)}>Cancel</Button>
              <Button type="submit" variant="destructive" disabled={busy || deleteConfirmation !== "DELETE"}><Trash2 className="h-4 w-4" />{busy ? "Deleting…" : "Permanently delete data"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <p className="mt-6 text-sm text-muted-foreground">Sign in with the same account on each device. Existing browser records stay with an email account upgrade.</p>
    </>
  );
}

function Card({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="grid content-start gap-3 rounded-3xl border bg-card p-5">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      <p className="text-sm text-muted-foreground">{body}</p>
      <div>{children}</div>
    </div>
  );
}
