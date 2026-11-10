// Regression (was the reproduction, see docs/evidence/screens/2026-11-10-prompt-replacement/repro/): the four value edits
// on Plan, account settings and DocuRepo use the in-app ValueDialog instead of a browser pop-up (window.prompt).
// Same store call and data as the prompt path, the store's own rule shown inline, nothing saved on Cancel or Escape.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Account } from "@/lib/ledger";
import { defaultPreferences } from "@/lib/preferences";
import { callsOf, reset, spy } from "../records-archive/harness";

vi.mock("@/lib/store", async () => ({
  useStore: (await import("../records-archive/harness")).useStoreMock,
}));
vi.mock(
  "@tanstack/react-router",
  async () => (await import("../records-archive/harness")).routerMock,
);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));
vi.mock("@/components/AppShell", () => ({
  PageTitle: ({ title }: { title: string }) => <h1>{title}</h1>,
  Stat: ({ label }: { label: string }) => <p>{label}</p>,
}));
vi.mock("@/components/SectionTabs", () => ({ SectionTabs: () => null }));
vi.mock("@/components/PlanCalendar", () => ({ PlanCalendar: () => null }));
vi.mock("recharts", () => ({
  ResponsiveContainer: () => null,
  AreaChart: () => null,
  Area: () => null,
  ReferenceLine: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}));
vi.mock("@/lib/use-position", () => ({
  todayISO: () => "2026-11-10",
  usePosition: () => ({
    forecast: { shortDates: [], series: [] },
    safe: { amount: 0, lowest: 0, lowestDate: "2026-11-10", steps: [] },
    upcoming: [],
    cash: 0,
    minBalance: 0,
    reserves: 0,
    subscriptions: {
      monthly: 0,
      annual: 0,
      active: 0,
      detected: [],
      summary: { increases: [], duplicates: [] },
    },
    income: { received: 0, expectedRemaining: 0, expectedConfirmed: 0, bySource: {}, late: [] },
  }),
}));
vi.mock("@/components/ContractObligations", () => ({
  ContractObligations: () => null,
  NoticeDeadlines: () => null,
}));
vi.mock("@/components/books/VaultBooks", () => ({ VaultBooks: () => null }));
vi.mock("@/components/ExpenseDialog", () => ({ ExpenseDialog: () => null }));
vi.mock("@/components/MutualFundTools", () => ({ MutualFundTools: () => null }));
vi.mock("@/components/BankBalanceEditor", () => ({ BankBalanceEditor: () => null }));
vi.mock("@/components/BelongsTo", () => ({ BelongsTo: () => null }));
import { Route as PlanRoute } from "@/routes/_authenticated/plan";
import { Route as VaultRoute } from "@/routes/_authenticated/vault";
import { AccountTools } from "@/components/AccountTools";
import {
  accountNameProblem,
  commitmentAmountProblem,
  documentTitleProblem,
  statementBalanceProblem,
} from "@/lib/value-edits";
const Plan = (PlanRoute as unknown as { component: () => React.ReactElement }).component;
const Vault = (VaultRoute as unknown as { component: () => React.ReactElement }).component;

const rent = {
  id: "c-1",
  name: "Flat rent",
  kind: "rent",
  direction: "out",
  amount: 32000,
  frequency: "monthly",
  intervalDays: null,
  nextDue: "2026-12-01",
  accountId: null,
  category: "Rent",
  confirmed: true,
  essential: true,
  status: "active",
};
const card: Account = {
  id: "acc-card",
  name: "Amex card",
  kind: "credit_card",
  openingBalance: 0,
  archived: false,
};
const doc = {
  id: "doc-1",
  title: "LIC policy 2026",
  docType: "insurance",
  filePath: "owner/docs/lic.pdf",
  fileName: "lic.pdf",
  mimeType: "application/pdf",
  size: 1000,
  docDate: "2026-04-01",
  amount: 24000,
  currency: "INR",
  merchant: "LIC",
  notes: "",
  text: "",
  transactionId: null,
  accountId: null,
  loanId: null,
  expiresOn: null,
  createdAt: "2026-04-02T00:00:00Z",
  fields: [],
};
const bank: Account = {
  id: "acc-bank",
  name: "HDFC savings",
  kind: "savings",
  openingBalance: 0,
  archived: false,
};
let prompt: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  prompt = vi.spyOn(window, "prompt").mockImplementation(() => {
    throw new Error("window.prompt must not be used");
  });
});
afterEach(() => {
  expect(prompt).not.toHaveBeenCalled();
  cleanup();
  vi.restoreAllMocks();
});

const dialog = () => screen.getByRole("dialog");
const field = (label: string) => within(dialog()).getByLabelText(label) as HTMLInputElement;
const press = (name: string) => fireEvent.click(within(dialog()).getByRole("button", { name }));
const closed = () => waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

describe("value edits use the in-app dialog, never window.prompt", () => {
  it("Plan → Edit amount: labelled field prefilled and focused; the store's amount rule shown inline; saves the same commitment with the new amount", async () => {
    reset(defaultPreferences() as unknown as Record<string, unknown>, {
      commitments: [rent],
      saveCommitment: spy("saveCommitment"),
    });
    render(<Plan />);
    fireEvent.click(screen.getByRole("button", { name: "Edit amount for Flat rent" }));
    expect(within(dialog()).getByRole("heading").textContent).toBe("Edit amount for Flat rent");
    expect(field("Amount (₹)").value).toBe("32000");
    await waitFor(() => expect(document.activeElement).toBe(field("Amount (₹)")));
    expect(dialog().className).toContain("native-sheet"); // bottom sheet on phone widths
    fireEvent.change(field("Amount (₹)"), { target: { value: "0" } });
    press("Save amount");
    expect(within(dialog()).getByRole("alert").textContent).toBe(
      "Amount must be greater than zero",
    );
    expect(field("Amount (₹)").getAttribute("aria-invalid")).toBe("true");
    expect(callsOf("saveCommitment")).toHaveLength(0);
    fireEvent.change(field("Amount (₹)"), { target: { value: "33000.50" } });
    press("Save amount");
    await closed();
    expect(callsOf("saveCommitment").map((c) => c.args)).toEqual([[{ ...rent, amount: 33000.5 }]]);
  });

  it("Plan → Edit amount: Cancel and Escape save nothing", async () => {
    reset(defaultPreferences() as unknown as Record<string, unknown>, {
      commitments: [rent],
      saveCommitment: spy("saveCommitment"),
    });
    render(<Plan />);
    fireEvent.click(screen.getByRole("button", { name: "Edit amount for Flat rent" }));
    fireEvent.change(field("Amount (₹)"), { target: { value: "99999" } });
    press("Cancel");
    await closed();
    fireEvent.click(screen.getByRole("button", { name: "Edit amount for Flat rent" }));
    expect(field("Amount (₹)").value).toBe("32000"); // reopens with the current value, not the abandoned edit
    fireEvent.change(field("Amount (₹)"), { target: { value: "99999" } });
    fireEvent.keyDown(field("Amount (₹)"), { key: "Escape" });
    await closed();
    expect(callsOf("saveCommitment")).toHaveLength(0);
  });

  it("Plan → Edit amount: a failed save keeps the dialog open with the reason next to the field", async () => {
    const saveCommitment = vi.fn(async () => {
      throw new Error("Network connection was lost");
    });
    reset(defaultPreferences() as unknown as Record<string, unknown>, {
      commitments: [rent],
      saveCommitment,
    });
    render(<Plan />);
    fireEvent.click(screen.getByRole("button", { name: "Edit amount for Flat rent" }));
    press("Save amount");
    expect(await within(dialog()).findByRole("alert")).toHaveTextContent(
      "Network connection was lost",
    );
    expect(saveCommitment).toHaveBeenCalledTimes(1);
  });

  it("Account → Rename account: prefilled; empty and duplicate names explained inline; saves updateAccount(id, { name })", async () => {
    reset(
      {},
      {
        accounts: [card, bank],
        valuations: [],
        updateAccount: spy("updateAccount"),
        adjustBalance: spy("adjustBalance"),
      },
    );
    render(<AccountTools a={card} />);
    fireEvent.click(screen.getByRole("button", { name: "Rename account" }));
    expect(field("Account name").value).toBe("Amex card");
    fireEvent.change(field("Account name"), { target: { value: "  " } });
    press("Save name");
    expect(within(dialog()).getByRole("alert").textContent).toBe("Name the account");
    fireEvent.change(field("Account name"), { target: { value: "hdfc savings" } });
    expect(within(dialog()).getByRole("alert").textContent).toBe(
      "Another account already has that name",
    );
    expect(callsOf("updateAccount")).toHaveLength(0);
    fireEvent.change(field("Account name"), { target: { value: "Amex Platinum" } });
    press("Save name");
    await closed();
    expect(callsOf("updateAccount").map((c) => c.args)).toEqual([
      [card.id, { name: "Amex Platinum" }],
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Rename account" }));
    press("Cancel");
    await closed();
    expect(callsOf("updateAccount")).toHaveLength(1);
  });

  it("Account → Adjust to statement balance: starts empty; blank or non-numbers explained inline; saves adjustBalance(account, number, today)", async () => {
    reset(
      {},
      {
        accounts: [card, bank],
        valuations: [],
        updateAccount: spy("updateAccount"),
        adjustBalance: spy("adjustBalance"),
      },
    );
    render(<AccountTools a={card} />);
    fireEvent.click(screen.getByRole("button", { name: "Adjust to statement balance" }));
    expect(field("Actual balance shown on your statement (₹)").value).toBe("");
    expect(field("Actual balance shown on your statement (₹)").getAttribute("inputmode")).toBe(
      "decimal",
    );
    press("Adjust balance");
    expect(within(dialog()).getByRole("alert").textContent).toBe(
      "Enter the balance you see at the bank",
    );
    fireEvent.change(field("Actual balance shown on your statement (₹)"), {
      target: { value: "12,000" },
    });
    expect(within(dialog()).getByRole("alert").textContent).toBe(
      "Enter the balance you see at the bank",
    );
    expect(callsOf("adjustBalance")).toHaveLength(0);
    fireEvent.change(field("Actual balance shown on your statement (₹)"), {
      target: { value: "-1500" },
    });
    press("Adjust balance");
    await closed();
    expect(callsOf("adjustBalance").map((c) => c.args)).toEqual([[card, -1500, "2026-11-10"]]);
    fireEvent.click(screen.getByRole("button", { name: "Adjust to statement balance" }));
    fireEvent.change(field("Actual balance shown on your statement (₹)"), {
      target: { value: "5000" },
    });
    fireEvent.keyDown(field("Actual balance shown on your statement (₹)"), { key: "Escape" });
    await closed();
    expect(callsOf("adjustBalance")).toHaveLength(1);
  });

  it("DocuRepo → Rename: prefilled title; a blank title is explained inline; saves updateDocument(id, { title }); Cancel saves nothing", async () => {
    reset(
      {},
      {
        documents: [doc],
        updateDocument: spy("updateDocument"),
        signedUrl: async () => null,
        downloadFile: async () => undefined,
      },
    );
    render(<Vault />);
    fireEvent.click(screen.getByRole("button", { name: "Rename LIC policy 2026" }));
    expect(field("Document title").value).toBe("LIC policy 2026");
    fireEvent.change(field("Document title"), { target: { value: " " } });
    press("Save title");
    expect(within(dialog()).getByRole("alert").textContent).toBe("Give the document a title");
    expect(callsOf("updateDocument")).toHaveLength(0);
    press("Cancel");
    await closed();
    expect(callsOf("updateDocument")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Rename LIC policy 2026" }));
    fireEvent.change(field("Document title"), { target: { value: "LIC policy 2026-27" } });
    fireEvent.submit(field("Document title")); // Enter in the field saves, like the primary button
    await closed();
    expect(callsOf("updateDocument").map((c) => c.args)).toEqual([
      ["doc-1", { title: "LIC policy 2026-27" }],
    ]);
  });

  it("inline rules are the store's own save rules (same messages), and amounts parse exactly as the prompt path did", () => {
    expect(["", "0", "-5", "abc"].map(commitmentAmountProblem)).toEqual(
      Array(4).fill("Amount must be greater than zero"),
    );
    expect(commitmentAmountProblem("1e3")).toBeNull(); // Number("1e3") = 1000, as before
    expect(accountNameProblem("Amex card", card, [card, bank])).toBeNull(); // its own name is not a duplicate
    expect(
      accountNameProblem("HDFC savings", card, [card, { ...bank, archived: true }]),
    ).toBeNull(); // archived names are free
    expect(statementBalanceProblem("0")).toBeNull();
    expect(statementBalanceProblem(" ")).toBe("Enter the balance you see at the bank");
    expect(documentTitleProblem("x")).toBeNull();
  });
});
