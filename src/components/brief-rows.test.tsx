// Review M1 of 0f6171b: the Weekly brief's "Needs attention" rows carry lists (outdated accounts, budget warnings), not
// amounts. They must wrap within the row on iPhone; the amount rows beside them keep each figure whole. Mocked store only.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultPreferences } from "@/lib/preferences";

const STALE = ["HDFC Regalia credit card", "ICICI Amazon Pay card", "SBI joint savings account", "Kotak 811 savings", "Axis Flipkart card"];
const WARN = ["Groceries 96%", "Dining out 104%", "Fuel 91%"];
vi.mock("@/lib/store", () => ({ useStore: () => ({ preferences: defaultPreferences(), savePreferences: async () => {}, transactions: [], accounts: [], commitments: [], valuations: [], expenses: [], budgets: {}, pendingCount: 0 }) }));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (opts: unknown) => ({ options: opts }) }));
vi.mock("@/components/AppShell", () => ({ PageTitle: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("use-webmcp-tool", () => ({ useWebMCP: () => {} }));
vi.mock("@/lib/use-position", () => ({ todayISO: () => "2026-11-12", usePosition: () => ({ upcoming: [], safe: { lowest: 50000 }, minBalance: 0, reserves: 0, reimbursements: { pendingAmount: 1234567.5 } }) }));
vi.mock("@/lib/intelligence", async (orig) => {
  const actual = await orig<typeof import("@/lib/intelligence")>();
  return { ...actual, briefDue: () => false, weeklyBrief: (i: Parameters<typeof actual.weeklyBrief>[0]) => actual.weeklyBrief({ ...i, staleAccounts: STALE, budgetWarnings: WARN }) };
});

import { Route } from "@/routes/_authenticated/brief";

afterEach(cleanup);

describe("Weekly brief rows", () => {
  it("lists wrap as text; amounts stay whole", () => {
    const Brief = (Route as unknown as { options: { component: () => React.JSX.Element } }).options.component;
    render(<Brief />);
    for (const text of [STALE.join(", "), WARN.join(", ")]) {
      const value = screen.getByText(text);
      expect(value).toHaveAttribute("data-value-kind", "text");
      expect(value).not.toHaveClass("whitespace-nowrap");
      // The global .font-mono rule is nowrap, so a text value must say whitespace-normal explicitly.
      expect(value).toHaveClass("whitespace-normal");
    }
    const pending = screen.getByText("Pending reimbursements").parentElement!.lastElementChild!;
    expect(pending.textContent).toBe("₹12,34,567.50");
    expect(pending).toHaveClass("whitespace-nowrap");
  });
});
