import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Trash2, Upload } from "lucide-react";
import { PageTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { PasskeySettings } from "@/components/DeviceLock";
import { FinanceSettings } from "@/components/FinanceSettings";
import { useStore } from "@/lib/store";
import { BACKUP_TABLES, createBackupZip, prepareRestore, readBackup, type Backup } from "@/lib/backup";
import { downloadBlob } from "@/lib/reports";

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
  const { userId, name, updateName, deleteAll, refresh, transactions, accounts } = useStore();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const backup = async () => {
    setBusy(true);
    try {
      const out: Backup["data"] = {};
      for (const t of BACKUP_TABLES) {
        const { data, error } = await supabase.from(t).select("*");
        if (error) throw new Error(error.message);
        out[t] = data ?? [];
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
    try {
      if (f.size > 150 * 1024 * 1024) throw Error("Backup must be under 150 MB");
      const { backup: j, files } = readBackup(new Uint8Array(await f.arrayBuffer()), /\.zip$/i.test(f.name));
      const { data: restored, paths } = prepareRestore(j, userId);
      if (!window.confirm("Restore this backup into your account? Existing matching records will be updated.")) return;
      for (const [oldPath, newPath] of paths) {
        const bytes = files[oldPath];
        if (!bytes) {
          const { error } = await supabase.storage.from("receipts").download(newPath);
          if (error) throw Error("This older backup doesn't contain its receipt files. Restore it to the original account or choose a complete ZIP backup.");
          continue;
        }
        const { error } = await supabase.storage.from("receipts").upload(newPath, new Uint8Array(bytes).buffer, { upsert: true });
        if (error) throw Error("Couldn't restore a file — please try again");
      }
      let n = 0;
      for (const t of BACKUP_TABLES) {
        const rows = restored[t] ?? [];
        if (!rows.length) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await supabase.from(t).upsert(rows as any);
        if (error) throw new Error(`Couldn't restore ${t.replace("_", " ")}: ${error.message}`);
        n += rows.length;
      }
      if (j.name?.trim()) await updateName(j.name);
      await refresh();
      toast.success(`Restored ${n} records`);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); if (file.current) file.current.value = ""; }
  };

  const wipe = async () => {
    if (window.prompt('This permanently deletes your financial records across all devices. Type DELETE to confirm.') !== "DELETE") return;
    setBusy(true);
    try {
      await deleteAll();
      toast.success("All records deleted");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <>
      <PageTitle eyebrow="Settings" title="Your data" sub={`${transactions.length} entries · ${accounts.length} accounts`} />
      <div className="mb-5"><Button asChild variant="outline"><Link to="/auth">Sign in / account</Link></Button></div>
      <PasskeySettings />
      <FinanceSettings />
      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Back up everything" body="Accounts, entries, budgets, valuations, family and original receipt and document files.">
          <Button onClick={backup} disabled={busy}><Download className="h-4 w-4" />Download backup</Button>
        </Card>
        <Card title="Restore from a backup" body="Pick a Ledgerline backup file. Records are added back (or updated if they already exist).">
          <Button variant="secondary" onClick={() => file.current?.click()} disabled={busy}><Upload className="h-4 w-4" />Choose backup file</Button>
          <input ref={file} type="file" accept="application/zip,application/json,.zip,.json" className="sr-only" aria-label="Backup file" onChange={(e) => restore(e.target.files?.[0])} />
        </Card>
        <Card title="Export reports" body="CSV and PDF reports of spending, by category, family member and business vs personal.">
          <Button asChild variant="secondary"><Link to="/reports">Open reports</Link></Button>
        </Card>
        <Card title="Delete all data" body="Removes every record in this account. Download a backup first if you might need it.">
          <Button variant="destructive" onClick={wipe} disabled={busy}><Trash2 className="h-4 w-4" />Delete everything</Button>
        </Card>
      </div>
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
