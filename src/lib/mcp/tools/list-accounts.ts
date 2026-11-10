import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { accountBalance, ledgerView, txnFromRow, LEDGER_COLUMNS, type AccountKind } from "@/lib/ledger";
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
      sb.from("expenses").select(LEDGER_COLUMNS).eq("employee_id", ctx.getUserId() ?? "").limit(20000),
    ]);
    if (a.error) throw new ToolError(a.error.message);
    if (e.error) throw new ToolError(e.error.message);
    // Same ledger rules as the app: counterparts skipped, loan interest split, reversals netted (decision 1).
    const txns = ledgerView((e.data ?? []).map(txnFromRow));
    const accounts = (a.data ?? []).map((r) => ({ id: r.id, name: r.name, kind: r.kind, creditLimit: r.credit_limit, balance: accountBalance({ id: r.id, name: r.name, kind: r.kind as AccountKind, openingBalance: Number(r.opening_balance), archived: false }, txns) }));
    const text = accounts.length ? accounts.map((x) => `${x.name} (${x.kind}): ₹${x.balance}`).join("\n") : "No accounts.";
    return { content: [{ type: "text", text }], structuredContent: { accounts } };
  },
});
