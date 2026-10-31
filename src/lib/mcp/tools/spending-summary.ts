import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { cashflow } from "@/lib/ledger";
import { categoryParts } from "@/lib/expenses";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "spending_summary",
  title: "Monthly spending summary",
  description: "Income, spending, net and spending by category for one month, using the app's own accounting rules (transfers and card payments excluded, splits counted once).",
  inputSchema: { month: z.string().regex(/^\d{4}-\d{2}$/, "Use YYYY-MM").describe("Month as YYYY-MM.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ month }, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Not signed in");
    const [y, m] = month.split("-").map(Number) as [number, number];
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const { data, error } = await supabaseForUser(ctx).from("expenses")
      .select("id, expense_date, txn_type, amount, category, allocations, account_id, to_account_id, adjustment_sign")
      .gte("expense_date", `${month}-01`).lte("expense_date", end).limit(5000);
    if (error) throw new ToolError(error.message);
    const txns = (data ?? []).map((r) => ({ id: r.id, date: r.expense_date, txnType: r.txn_type as "expense", amount: Number(r.amount), category: r.category, allocations: Array.isArray(r.allocations) ? (r.allocations as { category: string; amount: number }[]) : [], accountId: r.account_id, toAccountId: r.to_account_id, adjustmentSign: (r.adjustment_sign === -1 ? -1 : 1) as 1 | -1 }));
    const f = cashflow(txns, `${month}-01`, end);
    const cats: Record<string, number> = {};
    for (const t of txns.filter((x) => x.txnType === "expense")) for (const p of categoryParts(t)) cats[p.category] = Math.round(((cats[p.category] ?? 0) + p.amount) * 100) / 100;
    const byCategory = Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([category, amount]) => ({ category, amount }));
    const text = [`${month}: income ₹${f.income}, spent ₹${f.spent}, net ₹${f.net}`, ...byCategory.map((c) => `${c.category}: ₹${c.amount}`)].join("\n");
    return { content: [{ type: "text", text }], structuredContent: { month, income: f.income, spent: f.spent, net: f.net, byCategory } };
  },
});
