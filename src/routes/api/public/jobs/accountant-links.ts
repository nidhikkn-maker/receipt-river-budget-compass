import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { PUBLIC_ORIGIN, reminderDue, sendDue } from "@/lib/upload-link";

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
        const { emailReminder, tokenFor } = await import("@/lib/upload-link.server");
        let sent = 0, reminded = 0;
        for (const c of contacts ?? []) {
          const { data: last } = await supabaseAdmin.from("upload_links").select("id, created_at, last_emailed_at, file_count, expires_at, revoked_at").eq("owner_id", c.owner_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (sendDue(c.send_day, last?.created_at ?? null)) {
            try { const r = await createFreshLink(c.owner_id, c); if (r.emailed) sent++; } catch { /* next owner */ }
            continue;
          }
          if (!last) continue;
          // One reminder to the accountant if nothing arrived a few days after the emailed link.
          const { count } = await supabaseAdmin.from("upload_link_events").select("id", { count: "exact", head: true }).eq("link_id", last.id).eq("kind", "reminded");
          if (!reminderDue({ emailedAt: last.last_emailed_at, fileCount: last.file_count, reminded: !!count, expiresAt: last.expires_at, revokedAt: last.revoked_at })) continue;
          try {
            const { data: p } = await supabaseAdmin.from("profiles").select("full_name").eq("id", c.owner_id).maybeSingle();
            const url = `${PUBLIC_ORIGIN}/u/${await tokenFor(last.id)}`;
            if (await emailReminder(c.email, c.name, p?.full_name || "your client", url, last.id)) {
              await supabaseAdmin.from("upload_link_events").insert({ owner_id: c.owner_id, link_id: last.id, kind: "reminded", detail: c.email });
              reminded++;
            }
          } catch { /* next owner */ }
        }
        return Response.json({ sent, reminded });
      },
    },
  },
});
