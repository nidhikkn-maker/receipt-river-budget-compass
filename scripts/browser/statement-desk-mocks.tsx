import { useState } from "react";
import { mergeUploadHistory } from '../../src/lib/statement-pipeline/history';
import { defaultPreferences, type FinancePreferences, type StatementUpload } from '../../src/lib/preferences';
import { atomicStatementUndo } from '../../src/lib/statement-pipeline/atomic-undo';
import { saveWithRecovery } from '../../src/lib/statement-pipeline/save-recovery';
import type { ExpenseInput } from '../../src/lib/expenses';

// Controlled copies only: no account session, Cloud client or real records.
const createFixture = () => ({
  accounts: [{ id: "desk-account", name: "Controlled bank", kind: "savings", openingBalance: 1000, archived: false, issuer: "", lastFour: null }],
  transactions: JSON.parse(sessionStorage.getItem("controlled-desk-ledger") ?? "[]") as Record<string, unknown>[],
  saves: [] as string[],
  removes: [] as string[],
  uploads: JSON.parse(sessionStorage.getItem('controlled-desk-uploads') ?? '[]') as StatementUpload[],
  moves: [] as { id: string; before: Record<string, unknown>[] }[],
  documents: JSON.parse(sessionStorage.getItem('controlled-desk-documents') ?? '[]') as Record<string, unknown>[],
  originalAttempts: [] as string[],
  failOriginals: false,
  failCompletion: false,
  failReconcile: false,
  loseEvidenceResponse: false,
  failRemoveId: '',
  loseSaveResponse: false,
  failSaveRead: false,
  failHistoryRemoval: false,
  atomicUnavailable: false,
  undoReceipts: JSON.parse(sessionStorage.getItem('controlled-undo-receipts') ?? '[]') as string[],
  atomicCalls: 0,
});
export const fixture = (window as unknown as { deskFixture?: ReturnType<typeof createFixture> }).deskFixture ?? createFixture();
Object.assign(window, { deskFixture: fixture });

export function useStore() {
  const [, bump] = useState(0);
  const [preferences, setPreferences] = useState<FinancePreferences>({ ...defaultPreferences(), categories: [{ name: "Food", archived: false }, { name: "Other", archived: false }], statementUploads: fixture.uploads });
  const refresh = async () => bump((n) => n + 1);
  return {
    userId: "controlled-statement-owner",
    accounts: [...fixture.accounts], transactions: fixture.transactions.map((t) => ({ ...t })), expenses: fixture.transactions.filter(t => t.txnType === 'expense'), preferences, loans: [], commitments: [], documents: fixture.documents, valuations: [], budgets: {}, departmentBudgets: {}, departmentBudgetError: false, members: [], memberName: () => 'Controlled owner',
    addDocument: async (_file: File, meta: Record<string, unknown>) => {
      if (typeof meta.id !== "string") throw new Error("Original must have a stable identity");
      fixture.originalAttempts.push(meta.id);
      if (fixture.failOriginals) throw new Error("Controlled storage outage");
      if (!fixture.documents.some((d) => d.id === meta.id)) fixture.documents.push({ ...meta, filePath: `controlled/${meta.id}/${_file.name}`, fileName: _file.name, mimeType: _file.type, original: Array.from(new Uint8Array(await _file.arrayBuffer())) });
      sessionStorage.setItem('controlled-desk-documents', JSON.stringify(fixture.documents));
      return meta.id;
    },
    confirmTransfer: async () => {},
    savePreferences: async (next: FinancePreferences) => { if (fixture.failHistoryRemoval) throw Error('History cleanup interrupted'); fixture.uploads = next.statementUploads ?? []; sessionStorage.setItem('controlled-desk-uploads', JSON.stringify(fixture.uploads)); setPreferences(next); },
    saveStatementUpload: async (upload: StatementUpload) => {
      if (upload.status === 'undone' && fixture.failHistoryRemoval) throw Error('History cleanup interrupted');
      if (upload.status === 'complete' && fixture.failCompletion) throw Error('Completion status response interrupted');
      const next = mergeUploadHistory({ ...preferences, statementUploads: fixture.uploads }, upload);
      fixture.uploads = next.statementUploads ?? []; sessionStorage.setItem('controlled-desk-uploads', JSON.stringify(fixture.uploads)); setPreferences(next);
    },
    save: async (input: Record<string, unknown>, opts?: { createId?: string }) => {
      const id = opts?.createId ?? crypto.randomUUID();
      await saveWithRecovery(async () => {
      if (!fixture.transactions.some((t) => t.id === id)) fixture.transactions.push({ ...input, id, originalAmount: input.amount, currency: "INR", splits: [], reconciledAt: null, statementRef: null, correctionRevision: 0 });
      fixture.saves.push(id);
      sessionStorage.setItem("controlled-desk-ledger", JSON.stringify(fixture.transactions));
      if (fixture.loseSaveResponse) { fixture.loseSaveResponse = false; throw Error('Saved response interrupted'); }
      }, async () => {
        if (fixture.failSaveRead) throw Error('Disconnected read');
        const t = fixture.transactions.find(t => t['id'] === id);
        return t ? { ...t, original_amount:t['amount'], expense_date:t['date'], txn_type:t['txnType'], account_id:t['accountId'], to_account_id:t['toAccountId'] ?? null, payment_method:t['paymentMethod'], member_id:t['memberId'] ?? null, fx_rate:1 } : null;
      }, input as unknown as ExpenseInput);
    },
    remove: async (e: { id: string }) => { if (fixture.failRemoveId === e.id) throw Error('Controlled Undo denied'); fixture.removes.push(e.id); const index = fixture.transactions.findIndex(t => t.id === e.id); if (index >= 0) fixture.transactions.splice(index, 1); sessionStorage.setItem('controlled-desk-ledger', JSON.stringify(fixture.transactions)); },
    reconcile: async (id: string, ref: string | null) => {
      if (fixture.failReconcile) { fixture.failReconcile = false; throw Error('Evidence linking interrupted'); }
      const entry = fixture.transactions.find(t => t.id === id);
      if (!entry) throw new Error("Missing saved statement entry");
      Object.assign(entry, { statementRef: ref, reconciledAt: ref ? new Date().toISOString() : null, correctionRevision: Number(entry.correctionRevision ?? 0) + 1 });
      sessionStorage.setItem("controlled-desk-ledger", JSON.stringify(fixture.transactions));
      if (fixture.loseEvidenceResponse) { fixture.loseEvidenceResponse = false; throw Error('Evidence committed; response interrupted'); }
    },
    addAccount: async () => { throw new Error("No new accounts in this test"); },
    setArchived: async () => {},
    refresh,
    correctFinancialEntries: async (p: { records: { id: string }[]; after: Record<string, unknown>[] }, id: string) => {
      fixture.moves.push({ id, before: p.records.map((r) => ({ ...fixture.transactions.find((t) => t.id === r.id)! })) });
      for (const a of p.after) Object.assign(fixture.transactions.find((t) => t.id === a.id)!, a);
      await refresh();
    },
    undoFinancialCorrection: async (id: string) => {
      const m = fixture.moves.find((x) => x.id === id);
      for (const b of m?.before ?? []) Object.assign(fixture.transactions.find((t) => t.id === b.id)!, b);
      await refresh();
    },
  };
}
// Only the accountant-upload reads are served, from the test's local fixture endpoints; anything else fails loudly.
type Q = { then: (ok: (r: { data: unknown; error: null }) => unknown) => Promise<unknown> } & Record<string, unknown>;
const chain = (run: () => Promise<unknown>): Q => {
  const q: Q = { then: (ok) => run().then((data) => ok({ data, error: null })) };
  for (const k of ["select", "is", "order", "eq", "in"]) q[k] = () => q;
  return q;
};
export const accountantConsumed: string[] = [];
Object.assign(window, { accountantConsumed });
export const supabase = {
  from: (table: string) => {
    // Read-only lists the page refreshes after saving come back empty; any write still fails loudly.
    if (table === 'expenses') return { select: () => {
      let id: string | undefined;
      const q = chain(async () => fixture.transactions.map(t => ({ id: t.id })));
      q.eq = (key: string, value: string) => { if (key === 'id') id = value; return q; };
      q.maybeSingle = async () => { const t = fixture.transactions.find(t => t.id === id); return { data: t ? { id:t.id, statement_ref: t.statementRef, reconciled_at: t.reconciledAt, correction_revision:t.correctionRevision ?? 0 } : null, error: null }; };
      return q;
    } };
    if (table === "transfer_links" || table === "expense_drafts") return { select: () => chain(async () => []) };
    if (table !== "accountant_uploads") throw new Error(`No Cloud access in this test (${table})`);
    return {
      select: () => chain(() => fetch("/__fixture/accountant-uploads").then((r) => (r.ok ? r.json() : []))),
      update: () => ({ in: (_c: string, ids: string[]) => { accountantConsumed.push(...ids); return Promise.resolve({ data: null, error: null }); } }),
    };
  },
  storage: { from: () => ({ download: (path: string) => fetch(`/__fixture/file?path=${encodeURIComponent(path)}`).then(async (r) => ({ data: r.ok ? await r.blob() : null, error: r.ok ? null : new Error("missing") })) }) },
};

export async function undoStatement({ data }: { data: { id: string; posted: string[]; reconciled: string[]; evidence: { id: string; ref: string }[]; expected: { id: string; ref: string | null; revision: number }[] } }) {
  await atomicStatementUndo(data.id, data, data.expected, {
    receipt: async id => { if (fixture.atomicUnavailable) throw Error('Safe Undo is awaiting database release approval. Your records and recovery history are unchanged.'); return fixture.undoReceipts.includes(id); },
    rows: async ids => fixture.transactions.filter(t => ids.includes(String(t['id']))).map(t => ({ ...t, correction_revision: t['correctionRevision'] ?? 0, statement_ref: t['statementRef'] ?? null })),
    commit: async (id, items) => {
      fixture.atomicCalls++;
      if (items.some(x => x.snapshot['id'] === fixture.failRemoveId)) throw Error('Controlled atomic Undo failed');
      const next = fixture.transactions.filter(t => !items.some(x => x.action === 'delete' && x.snapshot['id'] === t['id']));
      for (const t of next) if (items.some(x => x.action === 'unreconcile' && x.snapshot['id'] === t['id'])) Object.assign(t, { statementRef: null, reconciledAt: null });
      fixture.removes.push(...items.filter(x => x.action === 'delete').map(x => String(x.snapshot['id'])));
      fixture.transactions = next;
      fixture.undoReceipts.push(id);
      sessionStorage.setItem('controlled-undo-receipts', JSON.stringify(fixture.undoReceipts));
      sessionStorage.setItem('controlled-desk-ledger', JSON.stringify(next));
    },
  });
  return { ok: true };
}
