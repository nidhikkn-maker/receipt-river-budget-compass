// Integration wiring for Track C screens: each new screen is reachable from the place people already look.
// About from Settings, calendar item Details from the Plan calendar, bank account detail from Wealth, and the header
// bell opens the Notification centre. Links are rendered with a router stand-in that keeps params and search.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { defaultPreferences } from "@/lib/preferences";
import { reset } from "./records-archive/harness";

vi.mock("@/lib/store", async () => ({ useStore: (await import("./records-archive/harness")).useStoreMock }));
vi.mock("@tanstack/react-router", async () => {
  const base = (await import("./records-archive/harness")).routerMock;
  const href = (to = "", params: Record<string, string> = {}, search: Record<string, string> = {}, hash?: string) => {
    const path = to.replace(/\$(\w+)/g, (_, k: string) => params[k] ?? "");
    const q = new URLSearchParams(search).toString();
    return `${path}${q ? `?${q}` : ""}${hash ? `#${hash}` : ""}`;
  };
  return { ...base, Link: ({ children, to, params, search, hash, onClick: _onClick, ...rest }: { children?: React.ReactNode; to?: string; params?: Record<string, string>; search?: Record<string, string>; hash?: string; onClick?: unknown } & Record<string, unknown>) => <a href={href(to, params, search, hash)} {...rest}>{children}</a> };
});
vi.mock("@/lib/use-position", () => ({ todayISO: () => "2026-11-10" }));
vi.mock("@/components/SetupAssistant", () => ({ SetupAssistant: () => null }));
vi.mock("@/components/AppShell", () => ({ Stat: ({ label, value }: { label: string; value: string }) => <p>{label} {value}</p>, PageTitle: () => null }));
vi.mock("@/components/AccountingDetails", () => ({ AccountingDetails: () => null }));
vi.mock("@/components/PaymentMethodsManager", () => ({ PaymentMethodsManager: () => null }));
vi.mock("@/components/AccountForm", () => ({ AccountForm: () => null }));
vi.mock("@/components/AccountTools", () => ({ AccountTools: () => null }));
vi.mock("@/components/WealthPanels", () => ({ CardDetails: () => null, GoalsPanel: () => null, LoansPanel: () => null }));
vi.mock("@/components/FundPortfolio", () => ({ FundPortfolio: () => null }));
vi.mock("@/components/DematHoldings", () => ({ DematHoldings: () => null }));
vi.mock("@/components/books/MarketPanel", () => ({ MarketPanel: () => null }));
vi.mock("@/components/books/useBooks", () => ({ useNetWorth: () => ({ assets: [], liabilities: 0, net: 0, portfolio: 0, quality: [] }) }));
import { SettingsDirectory } from "./SettingsDirectory";
import { PlanCalendar } from "./PlanCalendar";
import { Route as WealthRoute } from "@/routes/_authenticated/wealth";
const Wealth = (WealthRoute as unknown as { component: () => React.ReactElement }).component;

const bank = { id: "bank-1", name: "HDFC savings", kind: "savings", openingBalance: 1000, archived: false };
const card = { id: "card-1", name: "Axis card", kind: "credit_card", openingBalance: 0, archived: false };
const rent = { id: "c1", name: "Flat rent", kind: "rent", direction: "out", amount: 32000, frequency: "monthly", intervalDays: null, nextDue: "2026-11-10", accountId: "bank-1", category: "Rent", confirmed: true, essential: true, status: "active" };
const loan = { id: "loan-1", name: "Car loan", emi: 9000, nextDue: "2026-11-10", status: "active", accountId: null, provider: "SBI" };
beforeEach(() => reset(defaultPreferences() as unknown as Record<string, unknown>, { accounts: [bank, card], commitments: [rent], loans: [loan], expenses: [], loadErrors: [] }));
afterEach(cleanup);

describe("links to the Track C screens", () => {
  it("Settings directory links to About Thapal", () => {
    render(<SettingsDirectory />);
    expect(screen.getByRole("link", { name: /About Thapal/ })).toHaveAttribute("href", "/about");
  });

  it("each Plan calendar item on the selected day has a Details link to /calendar-item with its id and date", () => {
    render(<PlanCalendar />);
    expect(screen.getByRole("link", { name: "Details for Flat rent" })).toHaveAttribute("href", "/calendar-item?id=commitment%3Ac1&date=2026-11-10");
    expect(screen.getByRole("link", { name: "Details for Car loan EMI" })).toHaveAttribute("href", "/calendar-item?id=loan%3Aloan-1&date=2026-11-10");
  });

  it("Wealth links each bank account (not cards) to its read-only detail page", () => {
    render(<Wealth />);
    expect(screen.getByRole("link", { name: "Account details for HDFC savings" })).toHaveAttribute("href", "/bank-account/bank-1");
    expect(screen.queryByRole("link", { name: "Account details for Axis card" })).toBeNull();
  });

  it("the header bell opens the Notification centre", () => {
    const src = readFileSync("src/components/AppShell.tsx", "utf8");
    expect(src).toMatch(/<Link to="\/notifications" aria-label="Notifications"/);
    expect(src).not.toMatch(/<Link to="\/inbox" aria-label="Notifications"/);
  });
});
