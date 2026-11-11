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
        for (const id of (owners ?? []) as string[]) {
          const { data: u, error: lookupError } = await supabaseAdmin.auth.admin.getUserById(id);
          const decision = demoCleanupDecision({ user: u?.user ?? null, error: lookupError });
          if (decision === "keep-upgraded-account") { await supabaseAdmin.from("demo_sessions").delete().eq("owner_id", id); continue; } // upgraded to a real account: keep records
          if (decision === "skip-unconfirmed") continue; // lookup failed or identity missing: never delete records on doubt
          // Records first (DEMO_GUEST_STEPS order); a failed required step keeps the identity for the next run.
          if (!(await removeDemoGuestRecords((t) => supabaseAdmin.from(t as never) as never, id))) continue;
          await supabaseAdmin.auth.admin.deleteUser(id);
          await supabaseAdmin.from("demo_sessions").delete().eq("owner_id", id);
          removed++;
        }
        return Response.json({ removed });
      },
    },
  },
});
