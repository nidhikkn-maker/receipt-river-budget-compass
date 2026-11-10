// P0-025 (Statement Inbox duplicate import). Before the fix a failed read of already-imported lines only showed a
// toast and Register stayed enabled with a partial "known" set, and every Register used a fresh random entry id, so
// registering again (after a failed read, a lost response or a re-import of the same statement) created a second
// entry. Evidence: docs/evidence/screens/2026-11-10-p0-025-026/repro-StatementInbox.before.txt.
// The fake Cloud below keeps expenses keyed by id (the real save is an id-upsert that ignores duplicates) and
// statement_line_imports keyed by owner+account+fingerprint, so "one entry per line" is checked by counting rows.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState, type ReactNode, type SetStateAction } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Account } from "@/lib/ledger";
import type { ExpenseInput, StatementLine } from "@/lib/expenses";
import { defaultPreferences } from "@/lib/preferences";

type ImportRow = { owner_id: string; account_key: string; fingerprint: string; line_date: string; batch_id: string; file_label: string; created_at: string; entry_id: string | null; registered_at: string | null };
const OWNER = "11111111-1111-4111-8111-111111111111";
const cloud = vi.hoisted(() => ({
  expenses: new Map<string, { input: unknown; reconciled: string | null }>(),
  imports: [] as ImportRow[],
  readFails: 0,
  failSaveTitles: new Set<string>(),
  lostResponseTitles: new Set<string>(),
  claimInstalled: true,
  saves: [] as string[],
}));

function claim(args: { p_account_key: string; p_batch_id: string; p_file_label: string; p_lines: { fingerprint: string; line_date: string; entry_id: string }[] }) {
  const out: { fingerprint: string; entry_id: string | null; outcome: string }[] = [];
  for (const l of args.p_lines) {
    const row = cloud.imports.find((r) => r.account_key === args.p_account_key && r.fingerprint === l.fingerprint);
    if (!row) {
      cloud.imports.push({ owner_id: OWNER, account_key: args.p_account_key, fingerprint: l.fingerprint, line_date: l.line_date, batch_id: args.p_batch_id, file_label: args.p_file_label, created_at: new Date().toISOString(), entry_id: l.entry_id, registered_at: null });
      out.push({ fingerprint: l.fingerprint, entry_id: l.entry_id, outcome: "claimed" });
    } else if (row.entry_id && !row.registered_at && !cloud.expenses.has(row.entry_id)) out.push({ fingerprint: l.fingerprint, entry_id: row.entry_id, outcome: "pending" });
    else out.push({ fingerprint: l.fingerprint, entry_id: row.entry_id, outcome: "registered" });
  }
  return out;
}

vi.mock("@/integrations/supabase/client", () => {
  const query = (table: string) => {
    const filters: Record<string, unknown> = {};
    let range: [number, number] = [0, 999];
    let op: "select" | "delete" = "select";
    const run = () => {
      if (table !== "statement_line_imports") return { data: [], error: null };
      if (op === "delete") { cloud.imports = cloud.imports.filter((r) => r.batch_id !== filters["batch_id"]); return { data: null, error: null }; }
      if (cloud.readFails > 0) { cloud.readFails--; return { data: null, error: { message: "network timeout" } }; }
      const rows = cloud.imports.filter((r) => Object.entries(filters).every(([k, v]) => (r as Record<string, unknown>)[k] === v));
      return { data: rows.slice(range[0], range[1] + 1), error: null };
    };
    const q: Record<string, unknown> = {
      select: () => q, order: () => q, limit: () => q, neq: () => q, in: () => q,
      eq: (k: string, v: unknown) => { filters[k] = v; return q; },
      range: (a: number, b: number) => { range = [a, b]; return q; },
      delete: () => { op = "delete"; return q; },
      upsert: (rows: Omit<ImportRow, "owner_id" | "created_at" | "entry_id" | "registered_at">[]) => {
        for (const r of rows) if (!cloud.imports.some((x) => x.account_key === r.account_key && x.fingerprint === r.fingerprint)) cloud.imports.push({ ...r, owner_id: OWNER, created_at: new Date().toISOString(), entry_id: null, registered_at: null });
        return Promise.resolve({ data: null, error: null });
      },
      then: (done: (x: unknown) => unknown, fail?: (e: unknown) => unknown) => Promise.resolve(run()).then(done, fail),
    };
    return q;
  };
  const missing = { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
  return { supabase: {
    from: query,
    rpc: (name: string, args: Record<string, unknown>) => {
      if (!cloud.claimInstalled) return Promise.resolve(missing);
      if (name === "claim_statement_lines") return Promise.resolve({ data: claim(args as Parameters<typeof claim>[0]), error: null });
      if (name === "confirm_statement_lines") {
        const ids = args["p_entry_ids"] as string[];
        let n = 0;
        for (const r of cloud.imports) if (r.entry_id && ids.includes(r.entry_id) && cloud.expenses.has(r.entry_id)) { r.registered_at = new Date().toISOString(); n++; }
        return Promise.resolve({ data: n, error: null });
      }
      if (name === "pending_statement_lines") {
        if (cloud.readFails > 0) { cloud.readFails--; return Promise.resolve({ data: null, error: { message: "network timeout" } }); }
        return Promise.resolve({ data: cloud.imports.filter((r) => r.account_key === args["p_account_key"] && r.entry_id && !r.registered_at).map((r) => ({ fingerprint: r.fingerprint })), error: null });
      }
      return Promise.resolve(missing);
    },
  } };
});

const ACCOUNTS: Account[] = [{ id: "bank-1", name: "HDFC Savings", kind: "savings", openingBalance: 0, archived: false }];
const preferences = defaultPreferences();
const store = {
  userId: OWNER, transactions: [], accounts: ACCOUNTS, preferences,
  save: vi.fn(async (input: ExpenseInput, opts?: { createId?: string }) => {
    await Promise.resolve();
    if (cloud.failSaveTitles.has(input.title)) { cloud.failSaveTitles.delete(input.title); throw new Error("timeout"); }
    const id = opts?.createId ?? crypto.randomUUID();
    cloud.saves.push(id);
    if (!cloud.expenses.has(id)) cloud.expenses.set(id, { input, reconciled: null });
    if (cloud.lostResponseTitles.has(input.title)) { cloud.lostResponseTitles.delete(input.title); throw new Error("timeout after save"); }
  }),
  reconcile: vi.fn(async (id: string, ref: string | null) => { const e = cloud.expenses.get(id); if (e) e.reconciled = ref; }),
  refresh: vi.fn(async () => {}),
};
vi.mock("@/lib/store", () => ({ useStore: () => store }));

const SECOND_TITLE = "Upi Uber India Ride";
const LINES: StatementLine[] = [
  { ref: "r1", date: "2026-11-02", description: "UPI/SWIGGY/412345678901/food order", amount: 450, direction: "debit" },
  { ref: "r2", date: "2026-11-03", description: "UPI/UBER INDIA/512345678902/ride", amount: 230, direction: "debit" },
];
const view = vi.hoisted(() => ({ lines: [] as unknown[] }));
vi.mock("@/lib/use-review-view", () => ({
  useReviewView: <T,>(name: string, initial: T | (() => T)): [T, (next: SetStateAction<T>) => void] => {
    const preset: Record<string, unknown> = { "statement-account": "bank-1", "statement-lines": view.lines, "statement-file": "hdfc-nov.csv" };
    // A preset value replaces the initial value for this screen only.
    return useState<T>(() => (name in preset ? preset[name] as T : typeof initial === "function" ? (initial as () => T)() : initial));
  },
}));
vi.mock("@/lib/statement-extract.functions", () => ({ extractStatement: vi.fn() }));
vi.mock("@tanstack/react-start", async (orig) => ({ ...(await orig<object>()), useServerFn: () => vi.fn() }));
vi.mock("@tanstack/react-router", async (orig) => ({ ...(await orig<object>()), Link: ({ children }: { children?: ReactNode }) => <a href="/inbox">{children}</a> }));
vi.mock("@/lib/confirm", () => ({ confirmAction: vi.fn(async () => true) }));
vi.mock("@/lib/statement-remembered", () => ({ rememberedStatementAccount: vi.fn(async () => null) }));

import { StatementInbox } from "./StatementInbox";

beforeEach(() => {
  cloud.expenses.clear(); cloud.imports = []; cloud.readFails = 0; cloud.failSaveTitles.clear(); cloud.lostResponseTitles.clear(); cloud.claimInstalled = true; cloud.saves = [];
  view.lines = LINES.map((l) => ({ ...l }));
  store.save.mockClear(); store.reconcile.mockClear();
});
afterEach(() => cleanup());

const registerButton = () => screen.findByRole("button", { name: /^Register \d+$/ });
/** Waits until the imported-lines read has settled: Register is enabled, or there is nothing left to register. */
async function settled() {
  await waitFor(() => {
    const b = screen.getByRole("button", { name: /^Register \d+$/ });
    expect(b.textContent === "Register 0" || !b.hasAttribute("disabled")).toBe(true);
  });
  return screen.getByRole("button", { name: /^Register \d+$/ });
}
async function clickRegister() {
  const button = await settled();
  await act(async () => { fireEvent.click(button); });
  await waitFor(() => expect(store.save.mock.calls.length).toBeGreaterThan(0));
  await waitFor(() => { const b = screen.queryByRole("button", { name: /^Register \d+$/ }); expect(!b || !b.hasAttribute("disabled") || b.textContent === "Register 0").toBe(true); });
}
/** Opens the same statement again (a re-import, a retry on another tab, or after a reload). */
async function reopen() { cleanup(); view.lines = LINES.map((l) => ({ ...l })); render(<StatementInbox />); return settled(); }

for (const installed of [true, false]) {
  describe(`P0-025 Statement Inbox duplicate import (${installed ? "with" : "without"} the P9 database claim)`, () => {
    beforeEach(() => { cloud.claimInstalled = installed; });

    it("a failed read of already-imported lines shows the error with Retry and blocks Register until the read works", async () => {
      cloud.readFails = 1;
      render(<StatementInbox />);
      expect(await screen.findByText(/Couldn't load the lines already imported for this account/)).toBeInTheDocument();
      const button = await registerButton();
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(store.save).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
      await waitFor(() => expect(screen.getByRole("button", { name: /^Register 2$/ })).toBeEnabled());
      expect(screen.queryByText(/Couldn't load the lines already imported/)).toBeNull();
    });

    it("re-importing the same statement (also after Forget last upload) creates no second entry", async () => {
      render(<StatementInbox />);
      await clickRegister();
      expect(cloud.expenses.size).toBe(2);
      expect(await reopen()).toHaveTextContent("Register 0");
      // Forgetting the last upload makes the lines look new again; the stable entry ids still add nothing.
      fireEvent.click(screen.getByRole("button", { name: "Forget last upload" }));
      await waitFor(() => expect(screen.getByRole("button", { name: /^Register \d+$/ })).not.toHaveTextContent("Register 0"));
      await clickRegister();
      expect(cloud.expenses.size).toBe(2);
    });

    it("retry after a partial failure registers only the failed line and never repeats the saved one", async () => {
      cloud.failSaveTitles.add(SECOND_TITLE);
      render(<StatementInbox />);
      await clickRegister();
      expect(cloud.expenses.size).toBe(1);
      // The failed line stays on screen (it was not remembered as imported) and Register retries only it.
      await waitFor(() => expect(screen.getByRole("button", { name: /^Register \d+$/ })).toHaveTextContent("Register 1"));
      await clickRegister();
      expect(cloud.expenses.size).toBe(2);
      expect(await reopen()).toHaveTextContent("Register 0");
      expect(cloud.expenses.size).toBe(2);
    });

    it("a concurrent double submit (two open screens) creates one entry per line", async () => {
      render(<><StatementInbox /><StatementInbox /></>);
      const buttons = await screen.findAllByRole("button", { name: /^Register 2$/ });
      await waitFor(() => buttons.forEach((b) => expect(b).toBeEnabled()));
      await act(async () => { buttons.forEach((b) => fireEvent.click(b)); });
      await waitFor(() => expect(screen.queryAllByRole("button", { name: /^Register 2$/ })).toHaveLength(0));
      expect(cloud.expenses.size).toBe(2);
    });

    it("retrying after a timeout (entry saved, response lost) reuses the same entry id", async () => {
      cloud.lostResponseTitles.add(SECOND_TITLE);
      render(<StatementInbox />);
      await clickRegister();
      expect(cloud.expenses.size).toBe(2);
      await waitFor(() => expect(screen.getByRole("button", { name: /^Register \d+$/ })).toHaveTextContent("Register 1"));
      const first = [...cloud.saves];
      await clickRegister();
      expect(cloud.saves.at(-1)).toBe(first.at(-1));
      expect(cloud.expenses.size).toBe(2);
    });
  });
}
