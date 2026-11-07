import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

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
          const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
          if (u.user && !u.user.is_anonymous) { await supabaseAdmin.from("demo_sessions").delete().eq("owner_id", id); continue; } // upgraded to a real account: keep records
          const del = await supabaseAdmin.from("expenses").delete().eq("employee_id", id);
          const acc = del.error ? del : await supabaseAdmin.from("accounts").delete().eq("owner_id", id);
          if (acc.error) continue;
          await supabaseAdmin.from("finance_preferences").delete().eq("owner_id", id);
          await supabaseAdmin.auth.admin.deleteUser(id);
          await supabaseAdmin.from("demo_sessions").delete().eq("owner_id", id);
          removed++;
        }
        return Response.json({ removed });
      },
    },
  },
});
