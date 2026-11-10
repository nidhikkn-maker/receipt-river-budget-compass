// P0-004 regression for the shared pattern: failed reads show an error with Retry (never "no records").
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { loadAreaList, loadFailed } from "@/lib/load-state";
const m = vi.hoisted(() => ({ store: {} as Record<string, unknown> }));
vi.mock("@/lib/store", () => ({ useStore: () => m.store }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
import { ExpenseTable } from "./ExpenseTable";
import { StoreLoadNotice } from "./StoreLoadNotice";
afterEach(cleanup);

it("ExpenseTable shows the load error, not its empty text, when transactions failed; Retry refreshes", async () => {
  const refresh = vi.fn(async () => {});
  m.store = { memberName: () => "Me", loadErrors: ["transactions"], refresh };
  render(<ExpenseTable items={[]} empty="No expenses yet." />);
  expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load your transactions.");
  expect(screen.queryByText("No expenses yet.")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
});

it("ExpenseTable keeps the empty text when nothing failed", () => {
  m.store = { memberName: () => "Me", loadErrors: [], refresh: vi.fn() };
  render(<ExpenseTable items={[]} empty="No expenses yet." />);
  expect(screen.getByText("No expenses yet.")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("StoreLoadNotice names every failed area and says nothing was deleted", () => {
  m.store = { loadErrors: ["transactions", "accounts", "settings"], refresh: vi.fn() };
  render(<StoreLoadNotice />);
  expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load your transactions, accounts and settings, trips and claims.");
  expect(screen.getByRole("alert")).toHaveTextContent("Nothing has been deleted.");
  expect(loadAreaList(["loans"])).toBe("loans");
  expect(loadFailed(undefined, "loans")).toBe(false);
});
