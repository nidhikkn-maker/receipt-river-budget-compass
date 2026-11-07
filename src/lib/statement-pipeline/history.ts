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