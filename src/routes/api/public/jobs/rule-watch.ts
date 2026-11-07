import { describeHeadline } from "@/lib/books/rule-watch";
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { OFFICIAL_SOURCES } from "@/lib/books/regulatory";
import { fingerprint, headlines, newHeadlines } from "@/lib/books/rule-watch";

// Weekly check of official tax/GST/MCA pages. Records detected changes only; rules change after owner approval.
export const Route = createFileRoute("/api/public/jobs/rule-watch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: claimed } = await supabaseAdmin.rpc("claim_job", { _name: "rule-watch", _minutes: 10 });
        if (!claimed) return Response.json({ skipped: "already running or paused" });
        const report: Record<string, string> = {};
        for (const [i, s] of OFFICIAL_SOURCES.entries()) {
          const id = `src${i}:${s.area}`;
          try {
            const r = await fetch(s.url, { headers: { "User-Agent": "Mozilla/5.0 (Ledgerline rule watch)" }, signal: AbortSignal.timeout(15000) });
            if (!r.ok) { report[id] = `HTTP ${r.status}`; continue; }
            const lines = headlines(await r.text());
            if (!lines.length) { report[id] = "no headlines found"; continue; }
            const fp = await fingerprint(lines);
            const prev = await supabaseAdmin.from("regulatory_snapshots").select("fingerprint,excerpt").eq("source_id", id).order("fetched_at", { ascending: false }).limit(1).maybeSingle();
            if (prev.data?.fingerprint === fp) { report[id] = "unchanged"; continue; }
            const added = newHeadlines(prev.data ? prev.data.excerpt.split("\n") : null, lines);
            await supabaseAdmin.from("regulatory_snapshots").upsert({ source_id: id, url: s.url, fingerprint: fp, excerpt: lines.join("\n").slice(0, 20000) }, { onConflict: "source_id,fingerprint" });
            if (added.length) await supabaseAdmin.from("regulatory_changes").upsert({ source_id: id, url: s.url, previous_fingerprint: prev.data?.fingerprint ?? null, fingerprint: fp, summary: `${s.name}: ${added.length} new item${added.length > 1 ? "s" : ""}`, proposals: added.slice(0, 20).map(describeHeadline) }, { onConflict: "source_id,fingerprint", ignoreDuplicates: true });
            report[id] = prev.data ? `${added.length} new` : "baseline saved";
          } catch (e) { report[id] = (e as Error).message.slice(0, 80); }
        }
        const failed = Object.values(report).filter((v) => !/unchanged|new|baseline/.test(v)).length;
        await supabaseAdmin.from("job_state").update({ status: failed === OFFICIAL_SOURCES.length ? "failed" : "ok", reason: failed ? `${failed} source(s) unreachable` : null, last_success: new Date().toISOString(), detail: report, lease_until: new Date(0).toISOString() }).eq("name", "rule-watch");
        return Response.json(report);
      },
    },
  },
});
