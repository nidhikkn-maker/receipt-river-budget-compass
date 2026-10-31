import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { accountBalance, type AccountKind } from "@/lib/ledger";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_accounts",
  title: "List accounts and balances",
  description: "List your active bank, card, cash, loan and investment accounts with balances derived from recorded entries.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Not signed in");
    const sb = supabaseForUser(ctx);
    const [a, e] = await Promise.all([
      sb.from("accounts").select("id, name, kind, opening_balance, archived, credit_limit").eq("archived", false),
      sb.from("expenses").select("id, expense_date, txn_type, amount, account_id, to_account_id, adjustment_sign").limit(20000),
    ]);
    if (a.error) throw new ToolError(a.error.message);
    if (e.error) throw new ToolError(e.error.message);
    const txns = (e.data ?? []).map((r) => ({ id: r.id, date: r.expense_date, txnType: r.txn_type as "expense", amount: Number(r.amount), accountId: r.account_id, toAccountId: r.to_account_id, adjustmentSign: (r.adjustment_sign === -1 ? -1 : 1) as 1 | -1 }));
    const accounts = (a.data ?? []).map((r) => ({ id: r.id, name: r.name, kind: r.kind, creditLimit: r.credit_limit, balance: accountBalance({ id: r.id, name: r.name, kind: r.kind as AccountKind, openingBalance: Number(r.opening_balance), archived: false }, txns) }));
    const text = accounts.length ? accounts.map((x) => `${x.name} (${x.kind}): ₹${x.balance}`).join("\n") : "No accounts.";
    return { content: [{ type: "text", text }], structuredContent: { accounts } };
  },
});
