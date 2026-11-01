import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/jobs/report-jobs")({
  server: { handlers: { POST: async ({ request }) => {
    const failure = await authenticateCronRequest(request);
    if (failure) return failure;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runReportJobs } = await import("@/lib/report-jobs.server");
    const { runImportJobs } = await import('@/lib/import-jobs.server');
    try { return Response.json({ ...(await runReportJobs(supabaseAdmin)), imports: await runImportJobs(supabaseAdmin) }); }
    catch { return Response.json({ error: "Report jobs unavailable" }, { status: 503 }); }
  } } },
});
