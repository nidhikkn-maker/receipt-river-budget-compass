import { cleanStatementUploads, type FinancePreferences, type StatementUpload } from "../preferences";

export interface UploadHistoryApi {
  read: () => Promise<{ data: FinancePreferences; revision: number }>;
  write: (data: FinancePreferences, revision: number, mutationId: string) => Promise<void>;
}

/** Confirmed progress is monotone. A late partial checkpoint cannot erase a later completion. */
export function mergeUploadHistory(data: FinancePreferences, next: StatementUpload): FinancePreferences {
  const history = data.statementUploads ?? [];
  const previous = history.find(u => u.id === next.id);
  const unique = <T,>(items: T[], key: (item: T) => string): T[] => [...new Map(items.map(item => [key(item), item])).values()];
  const merged: StatementUpload = previous ? {
    ...previous, ...next,
    status: previous.status === "complete" || next.status === "complete" ? "complete" : "interrupted",
    expected: previous.expected ?? next.expected,
    posted: unique([...previous.posted, ...next.posted], id => id),
    reconciled: unique([...previous.reconciled, ...next.reconciled], id => id),
    createdAccounts: unique([...previous.createdAccounts, ...next.createdAccounts], a => a.id),
    sources: unique([...(previous.sources ?? []), ...(next.sources ?? [])], s => `${s.documentId}|${s.accountId}|${s.file}`),
    linkedDrafts: unique([...(previous.linkedDrafts ?? []), ...(next.linkedDrafts ?? [])], s => s.draftId),
  } : next;
  return { ...data, statementUploads: cleanStatementUploads([merged, ...history.filter(u => u.id !== next.id)]) };
}

/** Fresh owner read + existing revision-checked RPC. Retry conflicts/lost responses from a fresh read.
 * Ledger writes and checkpoints remain separate; this is not an atomic financial operation.
 */
export async function checkpointUpload(next: StatementUpload, api: UploadHistoryApi): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await api.read();
    const data = mergeUploadHistory(current.data, next);
    try { await api.write(data, current.revision, crypto.randomUUID()); return; }
    catch (error) { if (attempt === 2) throw error; }
  }
}
/**
 * An upload left "interrupted" is settled as complete only from saved evidence: the planned counts were
 * recorded before the first write, every planned entry and mark is in the confirmed history, every posted
 * entry is in the ledger, and (when an original was stored) every posted entry carries its statement link.
 * Without planned counts nothing is inferred, so a genuinely unfinished save is never shown as finished.
 */
export function settledUpload(u: StatementUpload, ledger: { id: string; statementRef?: string | null }[]): StatementUpload | null {
  if (u.status !== "interrupted" || !u.expected) return null;
  if (u.posted.length < u.expected.posted || u.reconciled.length < u.expected.reconciled) return null;
  if (u.posted.length + u.reconciled.length === 0) return null;
  const byId = new Map(ledger.map(e => [e.id, e]));
  const linked = !!u.sources?.length;
  for (const id of u.posted) { const e = byId.get(id); if (!e || (linked && !e.statementRef)) return null; }
  for (const id of u.reconciled) { const e = byId.get(id); if (!e || !e.statementRef) return null; }
  return { ...u, status: "complete" };
}
