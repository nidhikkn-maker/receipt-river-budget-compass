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
const TABLES = ["finance_preferences", "family_members", "accounts", "category_budgets", "commitments", "loans", "goals", "expenses"] as const;
type T = (typeof TABLES)[number];
const OWNER: Record<T, string> = { finance_preferences: "owner_id", family_members: "owner_id", accounts: "owner_id", category_budgets: "owner_id", commitments: "owner_id", loans: "owner_id", goals: "owner_id", expenses: "employee_id" };

function Settings() {
  const { userId, refresh, transactions, accounts } = useStore();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const backup = async () => {
    setBusy(true);
    try {
      const out: Record<string, unknown[]> = {};
      for (const t of TABLES) {
        const { data, error } = await supabase.from(t).select("*");
        if (error) throw new Error(error.message);
        out[t] = data ?? [];
      }
      const blob = new Blob([JSON.stringify({ app: "ledgerline", version: 1, exportedAt: new Date().toISOString(), data: out }, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `ledgerline-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Backup downloaded");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const restore = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const j = JSON.parse(await f.text()) as { app?: string; data?: Record<string, Record<string, unknown>[]> };
      if (j.app !== "ledgerline" || !j.data) throw new Error("That isn't a Ledgerline backup file");
      let n = 0;
      for (const t of TABLES) {
        const rows = (j.data[t] ?? []).map((r) => ({ ...r, [OWNER[t]]: userId }));
        if (!rows.length) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await supabase.from(t).upsert(rows as any);
        if (error) throw new Error(`Couldn't restore ${t.replace("_", " ")}: ${error.message}`);
        n += rows.length;
      }
      await refresh();
      toast.success(`Restored ${n} records`);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); if (file.current) file.current.value = ""; }
  };

  const wipe = async () => {
    if (window.prompt('This deletes all your records on this device. Type DELETE to confirm.') !== "DELETE") return;
    setBusy(true);
    try {
      for (const t of [...TABLES].reverse()) {
        const { error } = await supabase.from(t).delete().eq(OWNER[t] as never, userId as never);
        if (error) throw new Error(error.message);
      }
      await refresh();
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
        <Card title="Back up everything" body="Download one file with all accounts, entries, recurring payments, loans, goals, budgets and family. Receipt images stay in the app.">
          <Button onClick={backup} disabled={busy}><Download className="h-4 w-4" />Download backup</Button>
        </Card>
        <Card title="Restore from a backup" body="Pick a Ledgerline backup file. Records are added back (or updated if they already exist).">
          <Button variant="secondary" onClick={() => file.current?.click()} disabled={busy}><Upload className="h-4 w-4" />Choose backup file</Button>
          <input ref={file} type="file" accept="application/json,.json" className="sr-only" aria-label="Backup file" onChange={(e) => restore(e.target.files?.[0])} />
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
