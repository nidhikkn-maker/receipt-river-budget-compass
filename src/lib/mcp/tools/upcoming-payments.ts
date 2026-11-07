import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "upcoming_payments",
  title: "Upcoming payments and income",
  description: "List active scheduled bills, subscriptions, EMIs and expected income due within the next N days.",
  inputSchema: { days: z.number().int().min(1).max(365).optional().describe("Days ahead to look (default 30).") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ days }, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Not signed in");
    const end = new Date(Date.now() + (days ?? 30) * 864e5).toISOString().slice(0, 10);
    const { data, error } = await supabaseForUser(ctx).from("commitments")
      .select("id, name, kind, direction, amount, frequency, next_due, category, confirmed")
      .eq("status", "active").lte("next_due", end).order("next_due").limit(200);
    if (error) throw new ToolError(error.message);
    const items = (data ?? []).map((r) => ({ id: r.id, name: r.name, kind: r.kind, direction: r.direction, amount: Number(r.amount), frequency: r.frequency, nextDue: r.next_due, category: r.category, confirmed: r.confirmed }));
    const text = items.length ? items.map((x) => `${x.nextDue} · ${x.direction === "in" ? "+" : "−"}₹${x.amount} · ${x.name} (${x.frequency})`).join("\n") : "Nothing due.";
    return { content: [{ type: "text", text }], structuredContent: { items } };
  },
});
