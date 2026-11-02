import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { sendDue } from "@/lib/upload-link";

// Daily: on each owner's chosen day, a fresh 30-day link is made and emailed to their accountant (one recipient each).
export const Route = createFileRoute("/api/public/jobs/accountant-links")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { createFreshLink } = await import("@/lib/accountant.server");
        const { data: contacts } = await supabaseAdmin.from("accountant_contacts").select("*").eq("auto_send", true).neq("email", "");
        let sent = 0;
        for (const c of contacts ?? []) {
          const { data: last } = await supabaseAdmin.from("upload_links").select("created_at").eq("owner_id", c.owner_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (!sendDue(c.send_day, last?.created_at ?? null)) continue;
          try { const r = await createFreshLink(c.owner_id, c); if (r.emailed) sent++; } catch { /* next owner */ }
        }
        return Response.json({ sent });
      },
    },
  },
});
