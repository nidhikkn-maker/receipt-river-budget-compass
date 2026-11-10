// C2 screens on fixture data: K10 About, B05 Notification centre, B04 Calendar item, C03 Bank account (read-only).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { defaultPreferences } from "@/lib/preferences";
import { callsOf, harness, reset, routeState, spy } from "./records-archive/harness";

vi.mock("@/lib/store", async () => ({ useStore: (await import("./records-archive/harness")).useStoreMock }));
vi.mock("@tanstack/react-router", async () => (await import("./records-archive/harness")).routerMock);
vi.mock("@/components/AppShell", () => ({ PageTitle: ({ title, sub }: { title: string; sub?: string }) => <header><h1>{title}</h1><p>{sub}</p></header> }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => { const q: Record<string, unknown> = { then: (done: (x: unknown) => unknown) => Promise.resolve(done({ data: [{ name: "closing-prices", status: "ok", last_success: new Date().toISOString(), reason: null }], error: null })) }; for (const n of ["select", "in", "order", "limit", "eq", "maybeSingle"]) q[n] = () => q; return q; } } }));
vi.mock("@/lib/use-position", () => ({ todayISO: () => "2026-11-10" }));
import { NotificationCentre } from "./NotificationCentre";
import { Route as AboutRoute } from "@/routes/_authenticated/about";
import { Route as ItemRoute } from "@/routes/_authenticated/calendar-item";
import { Route as BankRoute } from "@/routes/_authenticated/bank-account.$accountId";
const page = (r: unknown) => (r as { component: () => React.ReactElement }).component;
const About = page(AboutRoute), CalendarItem = page(ItemRoute), BankAccount = page(BankRoute);

const bank = { id: "bank", name: "HDFC current", kind: "current", openingBalance: 100000, archived: false, lastFour: "4417", issuer: "HDFC Bank", minBalance: 0 };
const rent = { id: "c1", name: "Flat rent", kind: "rent", direction: "out", amount: 32000, frequency: "monthly", intervalDays: null, nextDue: "2026-11-12", accountId: "bank", category: "Rent", confirmed: true, essential: true, status: "active" };
const txns = [{ id: "a", title: "Swiggy", merchant: "Swiggy", category: "Miscellaneous", scope: "personal", memberId: null, splits: [], receipts: [], amount: 450, originalAmount: 450, currency: "INR", fxRate: 1, date: "2026-11-02", description: "", paymentMethod: "upi", accountId: "bank", reconciledAt: null, statementRef: null }];
beforeEach(() => { localStorage.clear(); routeState.search = {}; routeState.params = {}; reset(defaultPreferences() as unknown as Record<string, unknown>, { accounts: [bank], commitments: [rent], transactions: txns, loadErrors: [], pendingCount: 0, refresh: spy("refresh") }); });
afterEach(cleanup);

describe("C2 screens", () => {
  it("K10 About shows version, environment and health with no secrets", async () => {
    render(<About />);
    expect(screen.getByText("This version")).toBeInTheDocument();
    expect(screen.getByText("Environment")).toBeInTheDocument();
    expect(await screen.findByText(/Evening NSE\/BSE closing prices/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/fixture-anon|service_role|eyJ/);
    expect(screen.getByText("Known limitations")).toBeInTheDocument();
  });
  it("B05 lists grouped notices, marks all read (kept for this owner after reload) and links to the record", () => {
    const { unmount } = render(<NotificationCentre />);
    expect(screen.getByRole("region", { name: "Bills & payments" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Entries to review" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open payment: Flat rent" })).toHaveAttribute("href", "/calendar-item?id=commitment%3Ac1&date=2026-11-12");
    fireEvent.click(screen.getByRole("button", { name: /Mark all read/ }));
    expect(screen.getByRole("button", { name: /Mark all read/ })).toBeDisabled();
    unmount(); render(<NotificationCentre />);
    expect(screen.getByText(/^0 unread/)).toBeInTheDocument();
    expect(screen.getByText(/Proposed, not built yet/)).toBeInTheDocument();
    expect(harness.saves).toBe(0); // read marks never touch financial settings
  });
  it("B04 calendar item shows owner, source, recurrence, reminder and labels snooze/sync as not available", () => {
    routeState.search = { id: "commitment:c1", date: "2026-11-12" };
    render(<CalendarItem />);
    expect(screen.getByRole("heading", { name: "Flat rent" })).toBeInTheDocument();
    expect(screen.getByText("Monthly")).toBeInTheDocument();
    expect(screen.getByText(/3 days before/)).toBeInTheDocument();
    expect(screen.getByText(/Proposed — snoozing/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in Plan" })).toHaveAttribute("href", "/plan#commitment-c1");
  });
  it("C03 bank account shows the masked number, balances and recent entries, and offers no editing", () => {
    routeState.params = { accountId: "bank" };
    render(<BankAccount />);
    expect(screen.getByText("•••• 4417")).toBeInTheDocument();
    expect(screen.queryByText(/4417\d|\d4417/)).toBeNull();
    expect(screen.getAllByText("₹99,550.00").length).toBeGreaterThan(0);
    expect(screen.getByText(/Not matched yet/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(callsOf("refresh")).toHaveLength(0);
  });
});
