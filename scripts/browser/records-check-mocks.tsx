import { useState } from "react";

// Controlled copies only: no account session and no Cloud client are loaded.
const lines = [1, 2, 3, 4].map((n) => ({
  ref: `BROWSER-${n}`, date: `2026-04-0${n}`, description: `Controlled purchase ${n}`,
  amount: n * 100, direction: "debit",
}));
const initialChecked = ["ml-browser-statement-BROWSER-1-2026-04-01-100"];
export const fixture = {
  accounts: [{ id: "browser-account", name: "Controlled test account", kind: "savings", openingBalance: 10000, archived: false }],
  transactions: [],
  statements: [{ id: "browser-statement", account_id: "browser-account", currency: "INR", raw_lines: lines, period_from: "2026-04-01", period_to: "2026-04-30", status: "review" }],
  checked: [...initialChecked],
  saves: [] as string[][],
  failNextSave: false,
};
Object.assign(window, { recordsCheckFixture: fixture });

export function useStore() {
  const [preferences, setPreferences] = useState({ checkedAudit: [...initialChecked] });
  return {
    transactions: fixture.transactions, accounts: fixture.accounts, preferences,
    savePreferences: async (next: typeof preferences) => {
      if (fixture.failNextSave) { fixture.failNextSave = false; throw new Error("Controlled save failure"); }
      fixture.checked = [...next.checkedAudit];
      fixture.saves.push([...next.checkedAudit]);
      setPreferences(next);
    },
  };
}

export const supabase = {
  from: (table: string) => {
    if (table !== "import_batches") throw new Error(`Unexpected table: ${table}`);
    return { select: () => ({ neq: async () => ({ data: fixture.statements, error: null }) }) };
  },
};