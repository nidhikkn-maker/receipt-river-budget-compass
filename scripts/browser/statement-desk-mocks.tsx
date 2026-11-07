import { useState } from "react";

// Controlled copies only: no account session, Cloud client or real records.
export const fixture = {
  accounts: [{ id: "desk-account", name: "Controlled bank", kind: "savings", openingBalance: 1000, archived: false, issuer: "", lastFour: null }],
  transactions: [] as Record<string, unknown>[],
  saves: [] as string[],
  removes: [] as string[],
  uploads: [] as unknown[],
  moves: [] as { id: string; before: Record<string, unknown>[] }[],
  documents: [] as Record<string, unknown>[],
  originalAttempts: [] as string[],
  failOriginals: false,
};
Object.assign(window, { deskFixture: fixture });

export function useStore() {
  const [, bump] = useState(0);
  const [preferences, setPreferences] = useState<Record<string, unknown>>({ categories: [{ name: "Food", archived: false }, { name: "Other", archived: false }], tags: [], statementUploads: [] });
  const refresh = async () => bump((n) => n + 1);
  return {
    accounts: [...fixture.accounts], transactions: fixture.transactions.map((t) => ({ ...t })), preferences, loans: [], commitments: [], documents: [],
    addDocument: async (_file: File, meta: Record<string, unknown>) => {
      if (typeof meta.id !== "string") throw new Error("Original must have a stable identity");
      fixture.originalAttempts.push(meta.id);
      if (fixture.failOriginals) throw new Error("Controlled storage outage");
      if (!fixture.documents.some((d) => d.id === meta.id)) fixture.documents.push(meta);
      return meta.id;
    },
    confirmTransfer: async () => {},
    savePreferences: async (next: Record<string, unknown>) => { fixture.uploads = (next.statementUploads as unknown[]) ?? []; setPreferences(next); },
    save: async (input: Record<string, unknown>, opts?: { createId?: string }) => {
      const id = opts?.createId ?? crypto.randomUUID();
      if (!fixture.transactions.some((t) => t.id === id)) fixture.transactions.push({ ...input, id, originalAmount: input.amount, currency: "INR", splits: [], reconciledAt: null, statementRef: null });
      fixture.saves.push(id);
    },
    remove: async (e: { id: string }) => { fixture.removes.push(e.id); fixture.transactions.splice(fixture.transactions.findIndex((t) => t.id === e.id), 1); },
    reconcile: async () => {},
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
    if (table === "transfer_links" || table === "expense_drafts") return { select: () => chain(async () => []) };
    if (table !== "accountant_uploads") throw new Error(`No Cloud access in this test (${table})`);
    return {
      select: () => chain(() => fetch("/__fixture/accountant-uploads").then((r) => (r.ok ? r.json() : []))),
      update: () => ({ in: (_c: string, ids: string[]) => { accountantConsumed.push(...ids); return Promise.resolve({ data: null, error: null }); } }),
    };
  },
  storage: { from: () => ({ download: (path: string) => fetch(`/__fixture/file?path=${encodeURIComponent(path)}`).then(async (r) => ({ data: r.ok ? await r.blob() : null, error: r.ok ? null : new Error("missing") })) }) },
};
