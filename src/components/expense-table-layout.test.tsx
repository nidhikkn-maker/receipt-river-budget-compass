import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ store: {} as Record<string, unknown> }));
vi.mock("@/lib/store", () => ({ useStore: () => mocks.store }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));

import { ExpenseTable } from "./ExpenseTable";
import type { Expense } from "@/lib/expenses";

const expense = (id: string, title: string): Expense => ({
  id,
  title,
  date: "2026-11-01",
  category: "Meals",
  paymentMethod: "card",
  scope: "personal",
  amount: 120,
  originalAmount: 120,
  currency: "INR",
  fxRate: 1,
  receipts: [],
  tags: [],
  memberId: "me",
  accountId: "a1",
  txnType: "expense",
} as Expense);

function setTabletLandscape(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("orientation: landscape") ? matches : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  })) as unknown as typeof window.matchMedia;
}

afterEach(cleanup);

function setupStore() {
  mocks.store = {
    memberName: () => "Me",
    history: async () => [],
    setScope: vi.fn(),
    remove: vi.fn(),
    accounts: [],
    setReimbursement: vi.fn(),
    recordReimbursement: vi.fn(),
    convertToEmi: vi.fn(),
    members: [],
    setAllocations: vi.fn(),
    preferences: { categories: [], paymentInstruments: [], payees: [] },
  };
}

it("iPad landscape opens the expense detail in a side pane, not a modal", async () => {
  setTabletLandscape(true);
  setupStore();
  render(<ExpenseTable items={[expense("e1", "Lunch"), expense("e2", "Taxi")]} />);
  expect(screen.getByLabelText("Expense details")).toHaveTextContent("Choose an expense");
  fireEvent.click(screen.getByRole("button", { name: /Lunch/ }));
  const aside = await screen.findByLabelText("Expense details");
  expect(aside).toHaveTextContent("Lunch");
  expect(aside).toHaveTextContent("Meals");
  expect(screen.queryByRole("dialog")).toBeNull();
  // list stays visible alongside the detail
  expect(screen.getByRole("button", { name: /Taxi/ })).toBeInTheDocument();
  // switching selection swaps the side pane content
  fireEvent.click(screen.getByRole("button", { name: /Taxi/ }));
  expect(await screen.findByLabelText("Expense details")).toHaveTextContent("Taxi");
});

it("smaller or portrait screens keep the modal dialog", async () => {
  setTabletLandscape(false);
  setupStore();
  render(<ExpenseTable items={[expense("e1", "Lunch")]} />);
  expect(screen.queryByLabelText("Expense details")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Lunch/ }));
  expect(await screen.findByRole("dialog")).toHaveTextContent("Lunch");
});

it("multi-select keeps the list full-width even on iPad landscape", async () => {
  setTabletLandscape(true);
  setupStore();
  render(<ExpenseTable items={[expense("e1", "Lunch")]} selected={new Set()} onToggle={() => {}} />);
  expect(screen.queryByLabelText("Expense details")).toBeNull();
});
