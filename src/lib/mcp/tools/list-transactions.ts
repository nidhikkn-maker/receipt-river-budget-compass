import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export default defineTool({
  name: "list_transactions",
  title: "List transactions",
  description: "List your ledger entries (expenses, income, transfers, refunds) in INR, newest first, optionally filtered by date range, type, category or merchant.",
  inputSchema: {
    from: date.optional().describe("Start date, inclusive (YYYY-MM-DD)."),
    to: date.optional().describe("End date, inclusive (YYYY-MM-DD)."),
    type: z.enum(["expense", "income", "transfer", "refund", "reimbursement", "adjustment", "card_payment", "loan_repayment", "investment", "advance", "advance_settlement"]).optional().describe("Entry type."),
    category: z.string().max(80).optional().describe("Exact category name, e.g. Groceries."),
    merchant: z.string().max(80).optional().describe("Text the merchant name contains."),
    limit: z.number().int().min(1).max(200).optional().describe("Maximum rows (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to, type, category, merchant, limit }, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Not signed in");
    let q = supabaseForUser(ctx).from("expenses")
      .select("id, expense_date, title, merchant, category, txn_type, amount, currency, original_amount, fx_rate, payment_method, scope, tags")
      .eq("employee_id", ctx.getUserId() ?? "").order("expense_date", { ascending: false }).limit(limit ?? 50);
    if (from) q = q.gte("expense_date", from);
    if (to) q = q.lte("expense_date", to);
    if (type) q = q.eq("txn_type", type);
    if (category) q = q.eq("category", category);
    if (merchant) q = q.ilike("merchant", `%${merchant.replace(/[%_]/g, "")}%`);
    const { data, error } = await q;
    if (error) throw new ToolError(error.message);
    const rows = (data ?? []).map((r) => ({ id: r.id, date: r.expense_date, title: r.title, merchant: r.merchant, category: r.category, type: r.txn_type, amountInr: r.amount, currency: r.currency, originalAmount: r.original_amount, fxRate: r.fx_rate, paymentMethod: r.payment_method, scope: r.scope, tags: r.tags ?? [] }));
    const text = rows.length ? rows.map((r) => `${r.date} · ${r.type} · ${r.merchant ?? r.title} · ${r.category} · ₹${r.amountInr}`).join("\n") : "No matching entries.";
    return { content: [{ type: "text", text }], structuredContent: { transactions: rows } };
  },
});
