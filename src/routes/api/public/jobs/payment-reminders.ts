import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/jobs/payment-reminders")({
  server: { handlers: { POST: async ({request}) => {
    const failure=await authenticateCronRequest(request);
    if (failure) return failure;
    const seed=process.env["WEB_PUSH_SIGNING_SEED"];
    if (!seed) return Response.json({error:"Notifications unavailable"},{status:503});
    const { supabaseAdmin }=await import("@/integrations/supabase/client.server");
    const { dispatchPaymentReminders, dispatchCheckInReminders }=await import("@/lib/push-dispatch.server");
    try {
      const now=new Date();
      const daily=await dispatchPaymentReminders(supabaseAdmin,seed,now.toISOString().slice(0,10));
      const checkIns=await dispatchCheckInReminders(supabaseAdmin,seed,now).catch(()=>({checkInsSent:0}));
      return Response.json({...daily,...checkIns});
    }
    catch { return Response.json({error:"Reminder dispatch unavailable"},{status:503}); }
  } } },
});