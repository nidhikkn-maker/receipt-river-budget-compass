import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { demoCleanupDecision, demoGuestRecordsGone, removeDemoGuestRecords } from "@/lib/demo-cleanup";

/** Expired demo rows are read oldest first in pages; rows that must stay never use up the per-run work budget. */
const PAGE = 1000;
const SCAN_MAX = 5000; // expired rows looked at per run
const WORK_MAX = 200; // guests acted on per run (the applied expired_demo_owners() limit)

// Removes visitor demo copies older than 24 hours (records, then the guest identity).
export const Route = createFileRoute("/api/public/jobs/cleanup-demos")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // The applied expired_demo_owners() has no ORDER BY and a limit of 200, so rows that stay (e.g. an identity
        // missing with records left) could fill it every run; the expired rows are read here instead, oldest first,
        // all collected before any is changed so the pages stay stable.
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const owners: string[] = [];
        while (owners.length < SCAN_MAX) {
          const { data, error } = await supabaseAdmin.from("demo_sessions").select("owner_id, created_at").lt("created_at", cutoff)
            .order("created_at", { ascending: true }).order("owner_id", { ascending: true }).range(owners.length, owners.length + PAGE - 1);
          if (error) return Response.json({ error: "lookup failed" }, { status: 500 });
          const rows = (data ?? []) as { owner_id: string }[];
          owners.push(...rows.map((r) => r.owner_id));
          if (rows.length < PAGE) break;
        }
        let removed = 0, worked = 0;
        const failed: { table: string; error: string }[] = [];
        for (const id of owners.slice(0, SCAN_MAX)) {
          if (worked >= WORK_MAX) break;
          const { data: u, error: lookupError } = await supabaseAdmin.auth.admin.getUserById(id);
          const decision = demoCleanupDecision({ user: u?.user ?? null, error: lookupError });
          if (decision === "skip-unconfirmed") continue; // lookup failed: never delete records on doubt
          if (decision === "identity-missing") {
            // An earlier run deleted the identity but not the demo_sessions row. Finish only when every guest record is
            // confirmed gone by an exact count; otherwise keep everything (records are never deleted here).
            if (!(await demoGuestRecordsGone((t) => supabaseAdmin.from(t as never) as never, id))) continue;
            worked++;
            const { error: sessionError } = await supabaseAdmin.from("demo_sessions").delete().eq("owner_id", id);
            if (sessionError) { failed.push({ table: "demo_sessions", error: sessionError.message ?? String(sessionError) }); continue; }
            removed++;
            continue;
          }
          worked++;
          if (decision === "keep-upgraded-account") { await supabaseAdmin.from("demo_sessions").delete().eq("owner_id", id); continue; } // upgraded to a real account: keep records
          // Records first (DEMO_GUEST_STEPS order); a failed required step keeps the identity for the next run.
          const records = await removeDemoGuestRecords((t) => supabaseAdmin.from(t as never) as never, id);
          if (!records.ok) { failed.push({ table: records.table, error: records.error }); console.error("demo cleanup stopped before identity removal", records.table, records.error); continue; }
          // The demo_sessions row goes only after the identity is gone: a failed identity removal keeps it, so the next
          // hourly run finds this guest again (records already removed, the identity retried), and it is reported.
          // If this row delete fails, the next run sees the identity missing and finishes it once the records read gone.
          const { error: userError } = await supabaseAdmin.auth.admin.deleteUser(id);
          if (userError) { failed.push({ table: "auth.users", error: userError.message ?? String(userError) }); console.error("demo cleanup could not remove the guest identity", userError); continue; }
          const { error: sessionError } = await supabaseAdmin.from("demo_sessions").delete().eq("owner_id", id);
          if (sessionError) { failed.push({ table: "demo_sessions", error: sessionError.message ?? String(sessionError) }); continue; }
          removed++;
        }
        // A stopped guest is reported (and retried next hour); its identity and remaining records are kept.
        return Response.json({ removed, failed }, { status: failed.length ? 500 : 200 });
      },
    },
  },
});
