import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { bseUrl, candidateDays, nseUrl, parseBhavcopy, type ClosingRow } from "@/lib/market/bhavcopy";

const UA = { "User-Agent": "Mozilla/5.0 (Thapal closing prices)", Accept: "*/*" };

async function fetchDay(d: Date): Promise<{ rows: ClosingRow[]; notes: string[] }> {
  const notes: string[] = []; const rows: ClosingRow[] = [];
  try {
    const r = await fetch(nseUrl(d), { headers: UA });
    if (r.ok) { const { unzipSync, strFromU8 } = await import("fflate"); const files = unzipSync(new Uint8Array(await r.arrayBuffer())); for (const f of Object.values(files)) rows.push(...parseBhavcopy(strFromU8(f), "NSE")); }
    else notes.push(`NSE ${r.status}`);
  } catch (e) { notes.push(`NSE ${(e as Error).message.slice(0, 80)}`); }
  try {
    const r = await fetch(bseUrl(d), { headers: UA });
    if (r.ok) rows.push(...parseBhavcopy(await r.text(), "BSE")); else notes.push(`BSE ${r.status}`);
  } catch (e) { notes.push(`BSE ${(e as Error).message.slice(0, 80)}`); }
  return { rows, notes };
}

// Saves official NSE/BSE end-of-day closing prices (weekday evenings). A failed day keeps earlier prices.
export const Route = createFileRoute("/api/public/jobs/closing-prices")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: claimed } = await supabaseAdmin.rpc("claim_job", { _name: "closing-prices", _minutes: 10 });
        if (!claimed) return Response.json({ skipped: "already running or paused" });
        const notes: string[] = []; let saved = 0; let date: string | null = null;
        try {
          for (const d of candidateDays(new Date(), 3)) {
            const iso = d.toISOString().slice(0, 10);
            const have = await supabaseAdmin.from("market_quotes").select("symbol", { count: "exact", head: true }).eq("price_date", iso);
            if ((have.count ?? 0) > 1000) { date = iso; notes.push(`${iso} already saved`); break; }
            const r = await fetchDay(d); notes.push(...r.notes.map((n) => `${iso} ${n}`));
            if (!r.rows.length) continue;
            const rows = r.rows.map((x) => ({ exchange: x.exchange, symbol: x.symbol, isin: x.isin, series: x.series, name: x.name, close: x.close, prev_close: x.prevClose, price_date: x.date, source: x.exchange === "NSE" ? "NSE bhavcopy" : "BSE bhavcopy" }));
            for (let i = 0; i < rows.length; i += 1000) {
              const { error } = await supabaseAdmin.from("market_quotes").upsert(rows.slice(i, i + 1000), { onConflict: "exchange,symbol,series,price_date" });
              if (error) throw new Error(error.message);
              saved += Math.min(1000, rows.length - i);
            }
            date = iso; break;
          }
          await supabaseAdmin.from("job_state").update({ status: date ? "ok" : "failed", reason: date ? null : notes.join("; ").slice(0, 500), ...(date ? { last_success: new Date().toISOString() } : {}), detail: { date, saved, notes: notes.slice(0, 10) }, lease_until: new Date(0).toISOString() }).eq("name", "closing-prices");
          return Response.json({ date, saved, notes });
        } catch (e) {
          await supabaseAdmin.from("job_state").update({ status: "failed", reason: (e as Error).message.slice(0, 500), lease_until: new Date(0).toISOString() }).eq("name", "closing-prices");
          return Response.json({ error: "save failed" }, { status: 500 });
        }
      },
    },
  },
});
