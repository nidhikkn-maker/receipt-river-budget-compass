// Signature Flow shell and hub pages rendered with an isolated store stand-in (fixture figures, no Cloud).
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultPreferences } from "@/lib/preferences";
import type { Account } from "@/lib/ledger";

const local = vi.hoisted(() => ({ store: {} as Record<string, unknown>, path: "/home", smartAdd: 0 }));
vi.mock("@/lib/store", () => ({ useStore: () => local.store }));
vi.mock("@/lib/use-review-view", async () => {
  const { useState } = await import("react");
  return { useReviewView: <T,>(_: string, init: T) => useState<T>(init) };
});
vi.mock("@tanstack/react-router", async () => {
  const { MockLink } = await import("./test-router-mock");
  return {
    Link: MockLink,
    useRouter: () => ({ history: { location: { href: local.path }, subscribe: () => () => {}, canGoBack: () => false, back: () => {} }, navigate: () => {} }),
    useRouterState: ({ select }: { select: (s: unknown) => unknown }) => select({ location: { href: local.path, pathname: local.path.split("?")[0], state: {} } }),
    useNavigate: () => () => {},
  };
});
vi.mock("@/components/books/useBooks", () => ({ useNetWorth: () => ({ net: 2565536.4, recordsAsOf: "2026-11-09", pricesAsOf: null, quality: [] }) }));
vi.mock("@/components/DeviceLock", () => ({ DeviceLock: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/StepUpHost", () => ({ StepUpHost: () => null }));
vi.mock("@/components/OfflineBanner", () => ({ OfflineBanner: () => null }));
vi.mock("@/components/NavProgress", () => ({ NavProgress: () => null }));
vi.mock("@/components/DemoBanner", () => ({ DemoBanner: () => null }));
vi.mock("@/components/DraftsReminder", () => ({ DraftsReminder: () => null }));
vi.mock("@/components/PageSkeleton", () => ({ PageSkeleton: () => <p>Loading page</p> }));
vi.mock("@/components/smart-add/IntelligentCanvas", () => ({ IntelligentCanvas: ({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) => open ? <div role="dialog" aria-label="Smart Add"><button type="button" onClick={() => onOpenChange(false)}>Close Smart Add</button></div> : null }));
vi.mock("./SyncStatus", () => ({ SyncStatus: () => null }));

import { avatarLetters, SignatureShell } from "./SignatureShell";
import { SignatureHome } from "./pages/HomePage";
import { SignatureRecords } from "./pages/RecordsPage";
import { SignatureNotifications } from "./pages/UtilityPages";
import { SignatureMoney } from "./pages/MoneyPage";

const account = (x: Partial<Account> & Pick<Account, "id" | "name" | "kind">): Account => ({ openingBalance: 0, archived: false, ...x });
const save = vi.fn();
beforeEach(() => {
  local.path = "/home";
  save.mockReset().mockResolvedValue(undefined);
  local.store = {
    loading: false, name: "KK", userId: "owner-1", pendingCount: 0, syncState: "synced", lastSyncedAt: null, loadErrors: [], refresh: vi.fn(),
    preferences: { ...defaultPreferences(), homeScope: "personal", entities: [{ id: "e1", name: "Thapal Ventures Pvt Ltd", kind: "company", pan: "", gstins: [], booksFrom: "2026-27" }] },
    savePreferences: save,
    accounts: [account({ id: "a1", name: "HDFC Savings", kind: "savings", openingBalance: 100000 })],
    transactions: [], expenses: [], commitments: [], loans: [], goals: [], valuations: [], documents: [], budgets: {},
  };
});
afterEach(cleanup);

describe("Signature Flow shell", () => {
  it("has the page landmarks, a skip link and labelled controls", () => {
    render(<SignatureShell><p>body</p></SignatureShell>);
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("body");
    expect(screen.getByRole("complementary", { name: "Sidebar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main-content");
    for (const name of ["Calendar", "Notifications", "Thapal home"]) expect(screen.getAllByRole("link", { name }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Find anything/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Workspace: Personal/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Account: KK" })).toHaveTextContent("KK");
  });
  it("rail reaches Home, Money, To-do, Records, Reports and Add", () => {
    render(<SignatureShell><p>body</p></SignatureShell>);
    const rail = screen.getByRole("navigation", { name: "Main" });
    for (const [name, href] of [["Home", "/home"], ["Money", "/money"], ["To-do", "/tasks"], ["Records", "/records"], ["Reports", "/reports"]] as const) expect(within(rail).getByRole("link", { name })).toHaveAttribute("href", href);
    expect(within(rail).getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    expect(within(rail).getByRole("button", { name: "Add (Smart Add)" })).toBeInTheDocument();
  });
  it("iPhone bar: Home, Money, Add in the centre, To-do, Records; Add opens Smart Add and closing it returns", () => {
    render(<SignatureShell><p>body</p></SignatureShell>);
    const bar = screen.getByRole("navigation", { name: "Tab bar" });
    const items = [...bar.querySelectorAll("a, button")];
    expect(items.map((i) => i.textContent)).toEqual(["Home", "Money", "Add", "To-do", "Records"]);
    fireEvent.click(within(bar).getByRole("button", { name: "Add (Smart Add)" }));
    expect(screen.getByRole("dialog", { name: "Smart Add" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close Smart Add" }));
    expect(screen.queryByRole("dialog", { name: "Smart Add" })).toBeNull();
  });
  it("highlights To-do for today's Financial Inbox address and adds breadcrumbs to existing pages", () => {
    local.path = "/inbox";
    render(<SignatureShell><p>inbox body</p></SignatureShell>);
    expect(within(screen.getByRole("navigation", { name: "Tab bar" })).getByRole("link", { name: "To-do" })).toHaveAttribute("aria-current", "page");
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumbs).getByRole("button", { name: "Back to To-do" })).toBeInTheDocument();
    expect(within(crumbs).getByText("Financial Inbox")).toHaveAttribute("aria-current", "page");
  });
  it("lets the page reach the screen edges while shown (safe-area insets) and restores the viewport after", () => {
    const meta = document.createElement("meta"); meta.name = "viewport"; meta.content = "width=device-width, initial-scale=1"; document.head.appendChild(meta);
    const view = render(<SignatureShell><p>body</p></SignatureShell>);
    expect(meta.content).toBe("width=device-width, initial-scale=1, viewport-fit=cover");
    view.unmount();
    expect(meta.content).toBe("width=device-width, initial-scale=1");
    meta.remove();
  });
  it("the bottom bar and its central Add use the safe-area classes; the avatar carries its initials for the compact bar", () => {
    render(<SignatureShell><p>body</p></SignatureShell>);
    const bar = screen.getByRole("navigation", { name: "Tab bar" });
    expect(bar).toHaveClass("sf-tabbar");
    expect(within(bar).getByRole("button", { name: "Add (Smart Add)" })).toHaveClass("sf-tab", "sf-tab-add");
    expect(screen.getByRole("main")).toHaveClass("sf-main");
    expect(screen.getByRole("button", { name: "Account: KK" })).toHaveAttribute("data-initials", "KK");
  });
  it("hides the frame on the focused new-entry screen", () => {
    local.path = "/new";
    render(<SignatureShell><p>entry</p></SignatureShell>);
    expect(screen.queryByRole("navigation", { name: "Tab bar" })).toBeNull();
    expect(screen.queryByRole("banner")).toBeNull();
  });
  it("shows the page skeleton while records load", () => {
    local.store = { ...local.store, loading: true };
    render(<SignatureShell><p>body</p></SignatureShell>);
    expect(screen.getByText("Loading page")).toBeInTheDocument();
  });
  it("workspace switcher saves the real Home workspace and lists companies as proposed only", async () => {
    render(<SignatureShell><p>body</p></SignatureShell>);
    fireEvent.click(screen.getByRole("button", { name: /Workspace: Personal/ }));
    const list = await screen.findByRole("listbox", { name: "Choose workspace" });
    expect(within(list).getAllByRole("option").map((o) => o.textContent)).toEqual(["All spaces", "Personal", "Family", "Business"]);
    expect(screen.getByRole("list", { name: "Companies (proposed)" })).toHaveTextContent("Thapal Ventures Pvt Ltd");
    fireEvent.click(within(list).getByRole("button", { name: "Family" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ homeScope: "family" })));
    expect(Object.keys(save.mock.calls[0]![0]).sort()).toEqual(Object.keys(local.store["preferences"] as object).sort());
  });
  it("avatar letters keep a short name whole", () => {
    expect(avatarLetters("KK")).toBe("KK");
    expect(avatarLetters("Kavitha Kumar")).toBe("KK");
    expect(avatarLetters("Kavitha")).toBe("K");
    expect(avatarLetters("")).toBe("T");
  });
});

describe("hub pages", () => {
  it("Home: greeting, estimated net worth with as-of note, Coming up, next step and quick links", () => {
    render(<SignatureHome />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Good (morning|afternoon|evening), KK\.$/);
    expect(screen.getByText("₹25,65,536")).toHaveAttribute("title", "₹25,65,536.40");
    expect(screen.getByText(/balances to 9 Nov 2026/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Coming up" })).toBeInTheDocument();
    expect(screen.getByText("Nothing due in the next 30 days")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Suggested next step" })).toBeInTheDocument();
    for (const [name, href] of [[/Statement Desk/, "/statements"], [/^Travel/, "/trips"], [/^Records/, "/records"], [/^Reports Spending/, "/reports"]] as const) expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
  });
  it("Home: card statement amount due, payment status and total outstanding are shown separately (overdue only when unpaid)", () => {
    // Hand-calculated: the 18 Oct statement (₹30,000) was due 7 Nov and is unpaid; ₹15,679 was spent after it; today is 10 Nov.
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 10, 10, 12));
    try {
      const card = account({ id: "c1", name: "HDFC Regalia card", kind: "credit_card", statementDay: 18, dueDay: 7, creditLimit: 500000 });
      const spend = (id: string, date: string, amount: number) => ({ id, date, amount, originalAmount: amount, currency: "INR", accountId: "c1", txnType: "expense", category: "Shopping", title: id, merchant: null, scope: "personal", tags: [] });
      local.store = { ...local.store, accounts: [account({ id: "a1", name: "HDFC Savings", kind: "savings", openingBalance: 100000 }), card], transactions: [spend("billed", "2026-10-10", 30000), spend("unbilled", "2026-10-25", 15679)] };
      const { unmount } = render(<SignatureHome />);
      let metric = screen.getByText("Card payment").closest("div")!;
      expect(metric).toHaveAttribute("data-card-state", "overdue");
      expect(metric).toHaveTextContent("₹30,000");
      expect(metric).toHaveTextContent("Overdue since 7 Nov · ₹45,679 outstanding");
      expect(metric).not.toHaveTextContent(/Due 7 Nov/);
      unmount();
      // Not yet due (5 Nov): the same statement reads "Due 7 Nov".
      vi.setSystemTime(new Date(2026, 10, 5, 12));
      render(<SignatureHome />);
      metric = screen.getByText("Card payment").closest("div")!;
      expect(metric).toHaveAttribute("data-card-state", "due");
      expect(metric).toHaveTextContent("₹30,000");
      expect(metric).toHaveTextContent("Due 7 Nov · ₹45,679 outstanding");
      cleanup();
      // Paid on 6 Nov, today 10 Nov: a past due date alone is never overdue.
      vi.setSystemTime(new Date(2026, 10, 10, 12));
      local.store = { ...local.store, transactions: [spend("billed", "2026-10-10", 30000), spend("unbilled", "2026-10-25", 15679), { id: "pay", date: "2026-11-06", amount: 30000, originalAmount: 30000, currency: "INR", accountId: "a1", toAccountId: "c1", txnType: "transfer", category: "Transfer", title: "HDFC card bill", merchant: null, scope: "personal", tags: [] }] };
      render(<SignatureHome />);
      metric = screen.getByText("Card payment").closest("div")!;
      expect(metric).toHaveAttribute("data-card-state", "paid");
      expect(metric).toHaveTextContent("₹0");
      expect(metric).toHaveTextContent("Paid · ₹15,679 outstanding");
      expect(metric).not.toHaveTextContent(/Overdue/);
    } finally { vi.useRealTimers(); }
  });
  it("Home: a failed read shows Retry, never an empty ledger", () => {
    local.store = { ...local.store, loadErrors: ["transactions"] };
    render(<SignatureHome />);
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent("Nothing has been deleted");
  });
  it("Records: Reports is one tap away (two from Home on iPhone) and every row opens an existing page", () => {
    render(<SignatureRecords />);
    expect(screen.getByRole("link", { name: /^Reports/ })).toHaveAttribute("href", "/reports");
    for (const [name, href] of [[/Document Repository/, "/vault"], [/Travel Manager/, "/trips"], [/Asset Manager/, "/assets"], [/Reimbursements/, "/claim-submission"], [/Statement Desk/, "/statements"]] as const) expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.getByRole("searchbox", { name: "Search pages" })).toBeInTheDocument();
  });
  it("Money: account rows open beside the list", () => {
    render(<SignatureMoney />);
    fireEvent.click(screen.getByRole("button", { name: /HDFC Savings/ }));
    expect(screen.getByRole("region", { name: "HDFC Savings" })).toHaveTextContent("Not a live bank balance");
    expect(screen.getByRole("link", { name: /Open in Accounts/ })).toHaveAttribute("href", "/wealth");
  });
  it("Notifications is clearly labelled proposed and shows real alerts only", () => {
    local.store = { ...local.store, commitments: [{ id: "c1", name: "Property tax", kind: "bill", direction: "out", amount: 14820, frequency: "yearly", intervalDays: null, nextDue: "2020-01-05", accountId: null, category: "Taxes", confirmed: true, essential: true, status: "active" }] };
    render(<SignatureNotifications />);
    expect(screen.getByRole("note")).toHaveTextContent("The full notification centre is proposed.");
    expect(screen.getByRole("region", { name: "Needs action" })).toHaveTextContent("Property tax was due on 2020-01-05");
  });
});
