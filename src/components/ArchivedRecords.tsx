/**
 * Shared pieces for archive-instead-of-delete screens (P0-007..P0-016), on the P0-001 rules in src/lib/archive.ts:
 * useArchiveFlow (confirmation + reason via ArchiveDialog, then one save), ArchivedRecords (the Archived list with
 * who/when/why, history and Restore), and TableArchiveButton / ArchivedTableRecords for table rows whose archive
 * status lives in owner preferences (src/lib/records-archive.ts) until Track A adds archive columns.
 */
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Fold } from "@/components/Fold";
import { ArchiveDialog, type ArchiveNoun, type ArchiveRequest } from "@/components/ArchiveDialog";
import { archiveEventLine, type ArchiveActor, type ArchiveState } from "@/lib/archive";
import { archiveSummary, archiveTableRecord, restoreTableRecord, tableEntry, type ArchivedTable } from "@/lib/records-archive";
import { useStore } from "@/lib/store";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Archive/restore with confirmation and a required reason. `run` does the single save; errors keep everything as it was. */
export function useArchiveFlow(run: (req: ArchiveRequest, who: ArchiveActor) => Promise<void>) {
  const { userId } = useStore();
  const [request, setRequest] = useState<ArchiveRequest | null>(null);
  const confirm = async (reason: string) => {
    const req = request;
    setRequest(null);
    if (!req) return;
    try {
      await run(req, { by: userId, at: new Date().toISOString(), reason });
      toast.success(req.mode === "archive" ? `${cap(req.noun)} archived — figures unchanged` : `${cap(req.noun)} restored`);
    } catch (e) { toast.error((e as Error).message || "Nothing was changed. Try again."); }
  };
  const dialog = <ArchiveDialog request={request} onCancel={() => setRequest(null)} onConfirm={(r) => void confirm(r)} />;
  return { ask: setRequest, dialog, userId };
}

export interface ArchivedItem { id: string; name: string; detail?: ReactNode; state: ArchiveState }

/** The Archived list: each record with an Archived badge, who/when/why, its history and Restore. */
export function ArchivedRecords({ id, title, hint, items, noun, onRestore, userId, plain }: {
  id?: string | undefined; title: string; hint?: string | undefined; items: ArchivedItem[]; noun: ArchiveNoun; userId: string;
  onRestore: (item: ArchivedItem) => void;
  /** Render without the folding wrapper (inside an existing section). */
  plain?: boolean | undefined;
}) {
  if (!items.length) return null;
  const body = (
    <div className="space-y-2">
      {items.map((it) => {
        const { current, history } = archiveSummary(it.state);
        return (
          <div key={it.id} className="space-y-1 rounded-xl border p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="break-words font-semibold">{it.name} <span className="ml-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-normal text-secondary-foreground">Archived</span></p>
                {it.detail && <div className="text-xs text-muted-foreground">{it.detail}</div>}
              </div>
              <Button size="sm" variant="outline" aria-label={`Restore ${it.name}`} onClick={() => onRestore(it)}>Restore</Button>
            </div>
            {current && <p className="text-xs">{archiveEventLine(current, userId)} · Reason: {it.state.archiveReason ?? current.reason}</p>}
            <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Archive history ({history.length})</summary>
              <ul className="mt-1 space-y-0.5">{history.map((e, i) => <li key={`${e.at}-${i}`}>{archiveEventLine(e, userId)} · {e.reason}</li>)}</ul>
            </details>
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">Archived {noun === "profile" ? "profiles" : `${noun}s`} stay in your records and in every figure. Nothing is deleted.</p>
    </div>
  );
  return plain ? <div className="space-y-2"><p className="text-xs font-semibold text-muted-foreground">{title}</p>{body}</div> : <Fold {...(id ? { id } : {})} title={title} {...(hint ? { hint } : {})}>{body}</Fold>;
}

/** Archive/restore for one table row (loan, goal, scheduled payment, valuation, document) without touching the row. */
export function useTableArchive(table: ArchivedTable) {
  const { preferences, savePreferences } = useStore();
  const flow = useArchiveFlow(async (req, who) => {
    const next = req.mode === "archive" ? archiveTableRecord(preferences, table, req.id, req.name, who) : restoreTableRecord(preferences, table, req.id, who);
    await savePreferences(next);
  });
  const entryOf = (id: string) => tableEntry(preferences, table, id);
  return { ...flow, entryOf };
}

/** Archive button for one table row; renders the confirmation dialog itself. */
export function TableArchiveButton({ table, id, name, noun, disabledReason }: { table: ArchivedTable; id: string; name: string; noun: ArchiveNoun; disabledReason?: string | null }) {
  const { ask, dialog } = useTableArchive(table);
  return <>
    <Button size="sm" variant="ghost" aria-label={`Archive ${noun === "document" ? "document " : ""}${name}`} title={disabledReason ?? undefined} disabled={!!disabledReason} onClick={() => ask({ mode: "archive", id, name, noun })}>Archive</Button>
    {dialog}
  </>;
}

/** Archived rows of one table (e.g. loans) with Restore. `rows` are the archived rows as loaded; `describe` adds a detail line. */
export function ArchivedTableRecords<T extends { id?: string | undefined }>({ table, rows, nameOf, describe, noun, title, id, plain }: {
  table: ArchivedTable; rows: T[]; nameOf: (r: T) => string; describe?: (r: T) => ReactNode; noun: ArchiveNoun; title: string; id?: string | undefined; plain?: boolean | undefined;
}) {
  const { ask, dialog, entryOf, userId } = useTableArchive(table);
  const items: ArchivedItem[] = rows.flatMap((r) => { const e = r.id ? entryOf(r.id) : undefined; return r.id && e ? [{ id: r.id, name: nameOf(r), detail: describe?.(r), state: e }] : []; });
  return <>
    <ArchivedRecords id={id} title={title} items={items} noun={noun} userId={userId} plain={plain} onRestore={(it) => ask({ mode: "restore", id: it.id, name: it.name, noun })} />
    {dialog}
  </>;
}
