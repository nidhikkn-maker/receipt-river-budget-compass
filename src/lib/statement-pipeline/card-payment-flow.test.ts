// C-1321 / C-0111: a card bill paid from a bank account, uploaded through the real Statement Desk plan and
// posting path with an in-memory ledger. Disposable data only; never touches Cloud.
import { expect, it } from "vitest";
import { accountBalance, cashflow, type Account } from "../ledger";
import type { Expense, ExpenseInput } from "../expenses";
import type { CategorySetting } from "../preferences";
import { buildPlan } from "./plan";
import { applyUpload, undoUpload, type ApplyApi, type ApplyRequest } from "./apply";
import type { StmtFile, StmtLine } from "./line";

const categories: CategorySetting[] = [{ name: "Shopping", archived: false }, { name: "Financial charges", archived: false }, { name: "Miscellaneous", archived: false }];
const bank: Account = { id: "bank", name: "CUB Savings", kind: "savings", openingBalance: 50000, archived: false };
const card: Account = { id: "card", name: "Amex Card", kind: "credit_card", openingBalance: 0, archived: false };
const accounts = [bank, card];

const ln = (file: string, i: number, o: Omit<StmtLine, "key" | "file" | "currency" | "balance">): StmtLine => ({ key: `${file}#${i}`, file, currency: "INR", balance: null, ...o });
const file = (name: string, accountId: string, lines: StmtLine[]): StmtFile => ({ name, accountId, hint: null, currency: "INR", opening: null, closing: null, lines });

function memoryLedger() {
  const rows: Expense[] = [];
  const api: ApplyApi = {
    get transactions() { return rows; },
    save: async (input: ExpenseInput, opts) => {
      const id = opts?.createId ?? crypto.randomUUID();
      if (rows.some(r => r.id === id)) return; // same id → same entry, never a second copy
      rows.push({ ...(input as unknown as Expense), id, originalAmount: input.amount, fxRate: 1, reconciledAt: null, statementRef: null, receipts: [] });
    },
    remove: async (e) => { rows.splice(rows.findIndex(r => r.id === e.id), 1); },
    reconcile: async (id, ref) => { const r = rows.find(x => x.id === id)!; r.statementRef = ref; r.reconciledAt = ref ? "2026-11-07" : null; },
    addAccount: async () => { throw Error("no new accounts in this scenario"); },
    setArchived: async () => {},
    refresh: async () => {},
  };
  return { rows, api };
}

const purchases = file("amex-oct.csv", "card", [
  ln("amex-oct.csv", 0, { date: "2026-10-04", amount: 10000, direction: "debit", description: "AMAZON RETAIL" }),
  ln("amex-oct.csv", 1, { date: "2026-10-09", amount: 5000, direction: "debit", description: "CROMA STORE" }),
]);

const all = (p: ReturnType<typeof buildPlan>["accounts"][number], destination: string | null = null): ApplyRequest => ({ account: p, decisions: [...p.auto, ...p.ask], destination, reconcileIds: [] });

it("a partial card bill paid from the bank lowers both balances once, is never income or spending, and survives re-upload and undo", async () => {
  const { rows, api } = memoryLedger();

  // 1. Card purchases → ₹15,000 owed.
  let plan = buildPlan([purchases], accounts, rows, categories);
  await applyUpload([all(plan.accounts[0]!)], api);
  expect(accountBalance(card, rows)).toBe(15000);

  // 2. Bank and card statements uploaded together: ₹9,000 payment seen on both sides (partial settlement).
  const bankFile = file("cub-nov.csv", "bank", [ln("cub-nov.csv", 0, { date: "2026-11-08", amount: 9000, direction: "debit", description: "NEFT AMEX CARD PAYMENT" })]);
  const cardFile = file("amex-nov.csv", "card", [ln("amex-nov.csv", 0, { date: "2026-11-08", amount: 9000, direction: "credit", description: "PAYMENT RECEIVED THANK YOU" })]);
  plan = buildPlan([bankFile, cardFile], accounts, rows, categories);
  const [bankPlan, cardPlan] = plan.accounts;
  // Both sides are held for the person; neither saves itself.
  expect(bankPlan!.auto).toHaveLength(0);
  expect(cardPlan!.auto).toHaveLength(0);
  expect(bankPlan!.ask[0]!.transferWith?.file).toBe("amex-nov.csv");

  // Owner confirms the bank side as the payment to the card; the card side then matches that one entry.
  const bankReq: ApplyRequest = { account: bankPlan!, decisions: bankPlan!.ask, destination: "card", reconcileIds: [] };
  const first = await applyUpload([bankReq], api);
  expect(first.posted).toHaveLength(1);
  const payment = rows.find(r => r.id === first.posted[0])!;
  expect(payment).toMatchObject({ accountId: "bank", toAccountId: "card" });
  expect(["card_payment", "transfer"]).toContain(payment.txnType);

  expect(accountBalance(bank, rows)).toBe(41000);       // paying bank reduced
  expect(accountBalance(card, rows)).toBe(6000);        // unpaid ₹6,000 still outstanding
  expect(cashflow(rows)).toEqual({ income: 0, spent: 15000, net: -15000 }); // payment adds no spending and no income

  // 3. Card statement uploaded again: its credit now matches the posted payment — nothing new to save.
  plan = buildPlan([cardFile], accounts, rows, categories);
  expect(plan.accounts[0]!.matched).toHaveLength(1);
  expect(plan.accounts[0]!.auto.length + plan.accounts[0]!.ask.length).toBe(0);
  // Bank statement again: same — the payment is counted once.
  plan = buildPlan([bankFile], accounts, rows, categories);
  expect(plan.accounts[0]!.matched).toHaveLength(1);
  expect(plan.accounts[0]!.auto.length + plan.accounts[0]!.ask.length).toBe(0);

  // 4. Retrying the same confirmed save cannot create a second payment.
  await applyUpload([bankReq], api);
  expect(rows.filter(r => r.toAccountId === "card")).toHaveLength(1);
  expect(accountBalance(card, rows)).toBe(6000);

  // 5. Undo restores both balances.
  await undoUpload(first, api);
  expect(accountBalance(bank, rows)).toBe(50000);
  expect(accountBalance(card, rows)).toBe(15000);
});

it("a card credit with no matching bank payment is held for review, never saved as income", () => {
  const cardFile = file("amex-nov.csv", "card", [ln("amex-nov.csv", 0, { date: "2026-11-08", amount: 9000, direction: "credit", description: "PAYMENT RECEIVED THANK YOU" })]);
  const plan = buildPlan([cardFile], accounts, [], categories);
  const p = plan.accounts[0]!;
  expect(p.auto).toHaveLength(0);
  expect(p.ask).toHaveLength(1);
  expect(p.ask[0]!.draft.txnType).not.toBe("income");
});
