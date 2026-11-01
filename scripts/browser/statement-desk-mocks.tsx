import { useState } from "react";

// Controlled copies only: no account session, Cloud client or real records.
export const fixture = {
  accounts: [{ id: "desk-account", name: "Controlled bank", kind: "savings", openingBalance: 1000, archived: false, issuer: "", lastFour: null }],
  transactions: [] as Record<string, unknown>[],
  saves: [] as string[],
  removes: [] as string[],
  uploads: [] as unknown[],
};
Object.assign(window, { deskFixture: fixture });

export function useStore() {
  const [, bump] = useState(0);
  const [preferences, setPreferences] = useState<Record<string, unknown>>({ categories: [{ name: "Food", archived: false }, { name: "Other", archived: false }], tags: [], statementUploads: [] });
  const refresh = async () => bump((n) => n + 1);
  return {
    accounts: fixture.accounts, transactions: fixture.transactions, preferences,
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
    correctFinancialEntries: async () => {}, undoFinancialCorrection: async () => {},
  };
}
export const supabase = { from: () => { throw new Error("No Cloud access in this test"); } };
