import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { demoCleanupDecision, removeDemoGuestRecords } from "@/lib/demo-cleanup";

// Removes visitor demo copies older than 24 hours (records, then the guest identity).
export const Route = createFileRoute("/api/public/jobs/cleanup-demos")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: owners, error } = await supabaseAdmin.rpc("expired_demo_owners");
        if (error) return Response.json({ error: "lookup failed" }, { status: 500 });
        let removed = 0;
        const failed: { table: string; error: string }[] = [];
        for (const id of (owners ?? []) as string[]) {
          const { data: u, error: lookupError } = await supabaseAdmin.auth.admin.getUserById(id);
          const decision = demoCleanupDecision({ user: u?.user ?? null, error: lookupError });
          if (decision === "keep-upgraded-account") { await supabaseAdmin.from("demo_sessions").delete().eq("owner_id", id); continue; } // upgraded to a real account: keep records
          if (decision === "skip-unconfirmed") continue; // lookup failed or identity missing: never delete records on doubt
          // Records first (DEMO_GUEST_STEPS order); a failed required step keeps the identity for the next run.
          const records = await removeDemoGuestRecords((t) => supabaseAdmin.from(t as never) as never, id);
          if (!records.ok) { failed.push({ table: records.table, error: records.error }); console.error("demo cleanup stopped before identity removal", records.table, records.error); continue; }
          await supabaseAdmin.auth.admin.deleteUser(id);
          await supabaseAdmin.from("demo_sessions").delete().eq("owner_id", id);
          removed++;
        }
        // A stopped guest is reported (and retried next hour); its identity and remaining records are kept.
        return Response.json({ removed, failed }, { status: failed.length ? 500 : 200 });
      },
    },
  },
});
