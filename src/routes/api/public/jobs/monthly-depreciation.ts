import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Scheduled monthly depreciation [§34]: prepares last month's journals for every owner even if the Assets page
 * is never opened. Only prepares (never posts); stable ids and a revision check make reruns no-ops.
 */
export const Route = createFileRoute("/api/public/jobs/monthly-depreciation")({
  server: { handlers: { POST: async ({ request }) => {
    const failure = await authenticateCronRequest(request);
    if (failure) return failure;
    const day = new Date().getUTCDate();
    if (day > 3) return Response.json({ skipped: "runs on the 1st–3rd only" });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { cleanAssets } = await import("@/lib/assets");
    const { cleanBooks } = await import("@/lib/books/types");
    const { scheduledRun } = await import("@/lib/books/assets-ledger");
    const today = new Date().toISOString().slice(0, 10);
    const ready: string[] = [];
    let owners = 0, prepared = 0, conflicts = 0;
    for (let from = 0; ; from += 200) {
      const { data, error } = await supabaseAdmin.from("finance_preferences").select("owner_id, data, updated_at").not("data->assets", "is", null).order("owner_id").range(from, from + 199);
      if (error) return Response.json({ error: "Couldn't read records" }, { status: 503 });
      for (const row of data ?? []) {
        const raw = (row.data ?? {}) as Record<string, unknown>;
        const assets = cleanAssets(raw["assets"]);
        if (!assets.length) continue;
        const books = cleanBooks(raw["books"]);
        const run = await scheduledRun(assets, books.journals, books.closedPeriods, today);
        if (!run.added.length) continue;
        const next = { ...raw, books: { ...((raw["books"] as object | undefined) ?? {}), journals: run.journals } };
        // Revision check: if the owner saved in the meantime, skip — the page or next run prepares it.
        const upd = await supabaseAdmin.from("finance_preferences").update({ data: next as never, updated_at: new Date().toISOString() }).eq("owner_id", row.owner_id).eq("updated_at", row.updated_at).select("owner_id");
        if (upd.error || !upd.data?.length) { conflicts++; continue; }
        ready.push(row.owner_id); owners++; prepared += run.added.length;
      }
      if ((data?.length ?? 0) < 200) break;
    }
    let reminders = { sent: 0, skipped: 0 };
    const seed = process.env["WEB_PUSH_SIGNING_SEED"];
    if (ready.length && seed) {
      const { dispatchDepreciationReminders } = await import("@/lib/push-dispatch.server");
      const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1);
      reminders = await dispatchDepreciationReminders(supabaseAdmin, seed, ready, d.toISOString().slice(0, 7), today);
    }
    return Response.json({ owners, prepared, conflicts, reminders });
  } } },
});
