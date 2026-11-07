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
  if ((result.evidence ?? []).some(e => !ids.includes(e.id) && rows.some(r => r.id === e.id))) throw Error('Unconfirmed saved records need review before Undo');
  if (rows.length !== ids.length) throw Error('Undo records are missing; recovery is retained');
  const items = ids.map(rowId => {
    const snapshot = rows.find(r => r.id === rowId);
    const before = expected.find(r => r.id === rowId);
    if (!snapshot || !before || Number(snapshot.correction_revision) !== before.revision || (snapshot.statement_ref ?? null) !== before.ref) throw Error('Records changed; refresh and review before Undo');
    const evidence = result.evidence?.find(e => e.id === rowId);
    if (evidence && snapshot.statement_ref !== evidence.ref && !(result.posted.includes(rowId) && snapshot.statement_ref == null)) throw Error('Source evidence changed');
    return { action: result.posted.includes(rowId) ? 'delete' as const : 'unreconcile' as const, ref: before.ref, snapshot };
  });
  try { await api.commit(id, items); }
  catch (error) { if (!(await api.receipt(id).catch(() => false))) throw error; }
}