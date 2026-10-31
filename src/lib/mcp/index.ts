import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listTransactions from "./tools/list-transactions";
import spendingSummary from "./tools/spending-summary";
import listAccounts from "./tools/list-accounts";
import upcomingPayments from "./tools/upcoming-payments";

// Vite inlines the stable ref; the published SUPABASE_URL may be a proxy.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "team-expense-flow",
  title: "Team Expense Flow",
  version: "0.1.0",
  instructions: "Read-only access to the signed-in user's personal finance records: transactions, monthly spending by category, account balances and upcoming payments. Amounts are INR.",
  auth: auth.oauth.issuer({ issuer: `https://${projectRef}.supabase.co/auth/v1`, acceptedAudiences: "authenticated" }),
  tools: [listTransactions, spendingSummary, listAccounts, upcomingPayments],
});
