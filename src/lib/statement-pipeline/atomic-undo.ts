import { withdrawnAtOfRow } from '../withdrawal';
import type { ApplyResult } from './apply';

export interface UndoRow { id: string; ref: string | null; revision: number }
export interface AtomicUndoApi {
  receipt: (id: string) => Promise<boolean>;
  rows: (ids: string[]) => Promise<Record<string, unknown>[]>;
  commit: (id: string, items: { action: 'delete' | 'unreconcile'; ref: string | null; snapshot: Record<string, unknown> }[]) => Promise<void>;
}

/** One transaction for every financial reversal. No sequential-write fallback. */
export async function atomicStatementUndo(id: string, result: Pick<ApplyResult, 'posted' | 'reconciled' | 'evidence'>, expected: UndoRow[], api: AtomicUndoApi): Promise<void> {
  if (await api.receipt(id)) return;
  const ids = [...new Set([...result.posted, ...result.reconciled])];
  if (!ids.length) return;
  if (result.posted.some(x => result.reconciled.includes(x))) throw Error('Conflicting Undo selection');
  const rows = await api.rows([...new Set([...ids, ...(result.evidence ?? []).map(e => e.id)])]);
  if ((result.evidence ?? []).some(e => !ids.includes(e.id) && rows.some(r => r['id'] === e.id))) throw Error('Unconfirmed saved records need review before Undo');
  if (rows.length !== ids.length) throw Error('Undo records are missing; recovery is retained');
  const items = ids.map(rowId => {
    const snapshot = rows.find(r => r['id'] === rowId);
    const before = expected.find(r => r['id'] === rowId);
    // RB-LED-01: a withdrawn entry is kept history; Undo never removes it (the revision check below refuses it too).
    if (snapshot && withdrawnAtOfRow(snapshot)) throw Error('An entry from this upload was withdrawn. It is kept in history and Undo changes nothing; restore or review that entry first.');
    if (!snapshot || !before || Number(snapshot['correction_revision']) !== before.revision || (snapshot['statement_ref'] ?? null) !== before.ref) throw Error('Records changed; refresh and review before Undo');
    const evidence = result.evidence?.find(e => e.id === rowId);
    if (evidence && snapshot['statement_ref'] !== evidence.ref && !(result.posted.includes(rowId) && snapshot['statement_ref'] == null)) throw Error('Source evidence changed');
    return { action: result.posted.includes(rowId) ? 'delete' as const : 'unreconcile' as const, ref: before.ref, snapshot };
  });
  try { await api.commit(id, items); }
  catch (error) { if (!(await api.receipt(id).catch(() => false))) throw error; }
}

/** What the database reports one Statement Desk Undo did (P7 r2 reverse_statement_upload; P16 withdraws instead of deleting). */
export interface StatementUndoReport {
  request: string; upload: string;
  /** Posted rows: each kept and cancelled by a linked reversal entry on the correction date (KK decision 1). */
  reversed: { entryId: string; reversalEntryId: string; correctionDate: string }[];
  /** P0-034 (P16): rows the upload created that never posted: withdrawn with the Undo's reason (kept with receipts,
   *  statement reference and history; left out of every figure; Restore entry brings one back). */
  withdrawn?: string[];
  /** Before P16 only (P7 alone): never-posted rows were deleted. Always empty from P16 on. */
  deleted: string[];
  /** Existing rows that only lose their statement match (metadata). */
  unreconciled: string[];
  replayed: boolean;
}
/** The P7 manifest: 'delete' of a saved row becomes 'remove' (the database reverses it when posted). */
export const statementUndoItems = (items: { action: 'delete' | 'unreconcile'; ref: string | null; snapshot: Record<string, unknown> }[]) =>
  items.map(x => ({ action: x.action === 'delete' ? 'remove' as const : 'unreconcile' as const, ref: x.ref, snapshot: x.snapshot }));
/** The reason recorded on every reversal of one upload Undo. */
export const undoReason = (label: string | undefined) => `Statement Desk Undo of ${label?.trim() ? `"${label.trim().slice(0, 120)}"` : 'an upload'}`;
/** Plain summary of exactly what was reversed, removed and unmatched. */
export function undoSummary(r: StatementUndoReport | null): string {
  if (!r) return 'Upload reversed — your records are as they were';
  const parts = [r.reversed.length && `${r.reversed.length} posted entr${r.reversed.length === 1 ? 'y' : 'ies'} reversed (kept with a linked reversal)`,
    (r.withdrawn?.length ?? 0) > 0 && `${r.withdrawn!.length} unposted entr${r.withdrawn!.length === 1 ? 'y' : 'ies'} withdrawn (kept in history; restore from Withdrawn entries)`,
    r.deleted.length && `${r.deleted.length} unposted entr${r.deleted.length === 1 ? 'y' : 'ies'} removed`, r.unreconciled.length && `${r.unreconciled.length} match${r.unreconciled.length === 1 ? '' : 'es'} cleared`].filter(Boolean);
  return parts.length ? `Upload undone: ${parts.join(', ')}.` : 'Nothing needed to change.';
}
