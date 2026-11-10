import { confirmAction } from "@/lib/confirm";
import { exportBackupData } from "@/lib/exports.functions";
import { exportProblem } from "@/lib/exports";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Trash2, Upload } from "lucide-react";
import { PageTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { MpinSettings, PasskeySettings } from "@/components/DeviceLock";
import { FinanceSettings } from "@/components/FinanceSettings";
import { AppearanceSettings } from "@/components/AppearanceSettings";
import { PushSettings } from "@/components/PushSettings";
import { OrganisationDirectory } from "@/components/OrganisationDirectory";
import { PayeeDirectory } from '@/components/PayeeDirectory';
import { ImportRules } from '@/components/ImportRules';
import { SettingsDirectory } from "@/components/SettingsDirectory";
import { Fold } from "@/components/Fold";
import { SpeedCheck } from "@/components/SpeedCheck";
import { RoleBadge, TeamAccessSettings } from "@/components/TeamAccess";
import { SmartDefaultsSettings } from "@/components/SmartDefaultsSettings";
import { ReceiptProblemReports } from "@/components/ReceiptProblemReports";
import { useStore } from "@/lib/store";
import { BACKUP_VERSION, createBackupZip, describeRestoreReport, investmentTablesToWrite, planRestore, readBackup, type Backup } from "@/lib/backup";
import { downloadBlob } from "@/lib/reports";
import type { Database, Json } from "@/integrations/supabase/types";
import { UnreadableRecordsNotice } from "@/components/UnreadableRecordsNotice";
import { AccountRecovery, PasskeyDevices, SignOutOtherDevices } from "@/components/DeviceSecurity";
import { withStepUp } from "@/lib/step-up";
import { guardedRestore, previousRestoreLine, type GuardedRestoreResult, type RestoreDb } from "@/lib/restore-guard";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ensureStepUp } from "@/lib/step-up-check";


export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings & backup — Thapal" },
      { name: "description", content: "Back up, restore, export or delete your financial records." },
      { property: "og:title", content: "Settings & backup — Thapal" },
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
      // P0-006: the records are read, authorised (step-up where required) and audited on the server; the browser adds the files.
      const zipName = `ledgerline-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      const served = await withStepUp(() => exportBackupData({ data: { fileName: zipName } }));
      if (!served.ok) throw Error(exportProblem(served.error));
      const out = JSON.parse(served.json) as Backup["data"];
      const paths = new Set<string>();
      for (const e of out.expenses ?? []) for (const r of (e["receipts"] ?? []) as { path: string }[]) paths.add(r.path);
      for (const d of out.expense_drafts ?? []) for (const r of (d["receipts"] ?? []) as { path: string }[]) paths.add(r.path);
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
      const zip = createBackupZip({ app: "ledgerline", version: BACKUP_VERSION, owner: userId, name, exportedAt: new Date().toISOString(), data: out }, files);
      downloadBlob(new Blob([new Uint8Array(zip).buffer], { type: "application/zip" }), zipName); // authorised + audited above (records hash)
      toast.success("Backup downloaded");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  // P0-023: a backup restored before is never restored silently again: nothing changes and the earlier restore is shown;
  // "Restore again" needs a reason (and the usual step-up), and is recorded.
  const [repeat, setRepeat] = useState<{ file: File; line: string } | null>(null);
  const restore = async (f: File | undefined, rerestoreReason: string | null = null) => {
    if (!f) return;
    setBusy(true);
    const staged: string[] = [];
    let committed = false;
    try {
      if (f.size > 150 * 1024 * 1024) throw Error("Backup must be under 150 MB");
      const { backup: j, files } = readBackup(new Uint8Array(await f.arrayBuffer()), /\.zip$/i.test(f.name));
      const { data: restored, paths, report } = await planRestore(j, userId, { stageFiles: true });
      const summary = describeRestoreReport(report);
      if (!rerestoreReason && !await confirmAction(`Restore this backup into your account? Existing matching records will be updated. Current closed periods stay protected; backup closing history is retained as an unverified copy.${summary ? ` ${summary}.` : ""}`)) return;
      // Confirm before staging files so a long restore can't stop midway for re-confirmation.
      await ensureStepUp("restore_finance_backup");
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
      let outcome: GuardedRestoreResult;
      try {
        outcome = await withStepUp(() => guardedRestore({ owner: userId, data: restored, displayName: j.name?.trim() || undefined, rerestoreReason }, supabase as unknown as RestoreDb));
      } catch (e) {
        if (/reason of at least 5/.test((e as Error).message)) throw e;
        throw Error("Restore stopped; your existing records are unchanged. Check the backup and try again.");
      }
      if (outcome.status === "previously_restored") {
        // Nothing was written (staged files are removed below); show the earlier restore and offer an explicit re-restore.
        setRepeat({ file: f, line: previousRestoreLine(outcome.previous, userId) });
        return;
      }
      committed = true;
      const counts = { ...outcome.counts };
      // Older server restore functions only know the original tables: write investment rows afterwards, under the
      // same owner-only row security. Ids are deterministic, so retrying the whole restore is safe.
      let investmentError = "";
      for (const t of investmentTablesToWrite(restored, counts)) {
        const rows = restored[t] ?? [];
        const { error: invError } = t === "demat_accounts"
          ? await supabase.from("demat_accounts").upsert(rows as unknown as Database["public"]["Tables"]["demat_accounts"]["Insert"][], { onConflict: "id" })
          : await supabase.from("security_holdings").upsert(rows as unknown as Database["public"]["Tables"]["security_holdings"]["Insert"][], { onConflict: "id" });
        if (invError) { investmentError = invError.message; break; }
        counts[t] = rows.length;
      }
      const n = Object.values(counts).reduce((sum, count) => sum + count, 0);
      await refresh();
      if (investmentError) toast.error(`Restored ${n} records, but demat holdings could not be restored (${investmentError}). They are still in your backup file; restoring it again is safe.`);
      else toast.success(`Restored ${n} records${summary ? `. ${summary}` : ""}`);
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
      // Re-confirm first so deletion can't stop between listing files and removing records.
      await ensureStepUp("delete_my_finance_data");
      await deleteAll();
      setDeleteOpen(false);
      setDeleteConfirmation("");
      toast.success("All records deleted");
    } catch (e) { setDeleteError(e instanceof Error ? e.message : "Couldn't delete your data. Please try again."); } finally { setBusy(false); }
  };

  return (
    <>
      <PageTitle eyebrow="Settings" title="Settings" sub={`${transactions.length} entries · ${accounts.length} accounts`} />
      <div className="mb-5 flex flex-wrap gap-2"><Button asChild variant="outline"><Link to="/auth">Sign in / account</Link></Button><Button asChild variant="outline"><Link to="/rules" hash="classification">Transaction classification rules</Link></Button></div>
      <RoleBadge />
      <SettingsDirectory />
      <Fold id="security" title="Security & device unlock" hint="MPIN, Face ID, devices and account recovery"><MpinSettings /><PasskeySettings /><PasskeyDevices /><SignOutOtherDevices /><AccountRecovery /></Fold>
      <Fold id="appearance" title="Appearance" hint="Theme, light or dark, Home layout"><AppearanceSettings /></Fold>
      <Fold id="finance" title="Finance preferences" hint="Currency, categories, tags, budgets and AI privacy"><FinanceSettings /></Fold>
      <Fold id="smart-defaults" title="Smart defaults" hint="Usual category, payment and workspace on New expense"><SmartDefaultsSettings /></Fold>
      <Fold id="organisations" title="Organisations" hint="Employers, clients and reimbursement contacts"><OrganisationDirectory /></Fold>
      <Fold id="payees" title="Payees" hint="People and businesses you pay"><PayeeDirectory /></Fold>
      <Fold id="accountant" title="Accountant upload link" hint="Now lives in Statement Desk"><p className="text-sm text-muted-foreground">Your accountant's link, contact and monthly requests are managed in Statement Desk.</p><Button asChild variant="secondary" className="mt-2"><Link to="/statements" search={{ tab: "accountant" }}>Open in Statement Desk</Link></Button></Fold>
      <Fold id="rules" title="Import rules" hint="How statement lines are sorted automatically"><ImportRules /></Fold>
      <Fold id="team-access" title="Team access" hint="Who can view or edit team expenses and company tax"><TeamAccessSettings /></Fold>
      <Fold id="notifications" title="Notifications" hint="Phone alerts, reminder types and advance timing"><PushSettings /></Fold>
      <Fold id="speed" title="Speed check" hint="How fast main pages open on this device"><SpeedCheck /></Fold>
      <Fold id="problems" title="Problem reports" hint="Things you flagged in the receipt viewer"><ReceiptProblemReports /></Fold>
      <Fold id="data" title="Data, backups & reports" hint="Back up, restore, export or delete"><UnreadableRecordsNotice /><div className="grid gap-3 sm:grid-cols-2">
        <Card title="Back up everything" body="Accounts, entries, budgets, valuations, family and original receipt and document files.">
          <Button onClick={backup} disabled={busy}><Download className="h-4 w-4" />Download backup</Button>
        </Card>
        <Card title="Restore from a backup" body="Pick a Thapal backup file. Records are added back (or updated if they already exist).">
          <Button variant="secondary" onClick={() => file.current?.click()} disabled={busy}><Upload className="h-4 w-4" />Choose backup file</Button>
          <input ref={file} type="file" accept="application/zip,application/json,.zip,.json" className="sr-only" aria-label="Backup file" onChange={(e) => restore(e.target.files?.[0])} />
          <ConfirmDialog
            open={!!repeat}
            title="This backup was already restored"
            description={`Nothing was changed. ${repeat?.line ?? ""}.`}
            consequences={["Restoring it again updates matching records to the backup's copies (withdrawn entries stay as they are)", "The repeat is recorded with your reason"]}
            reason={{ label: "Reason for restoring again", placeholder: "For example: records were changed by mistake", validate: (v) => (v.trim().length >= 5 ? null : "Give a reason of at least 5 characters") }}
            confirmLabel="Restore again"
            cancelLabel="Keep my records"
            onConfirm={async (why) => { const f = repeat?.file; setRepeat(null); await restore(f, why); }}
            onClose={() => setRepeat(null)}
          />
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
      </div></Fold>
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
    <div className="grid content-start gap-2 rounded-2xl border bg-background/40 p-4">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{body}</p>
      <div>{children}</div>
    </div>
  );
}
