import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Signed-in, non-demo callers only: demo (guest) sessions can't use AI, push or imports. */
export const requireRealAccount = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(({ next, context }) => {
    const claims = context.claims as { is_anonymous?: boolean } | undefined;
    if (claims?.is_anonymous) throw new Error("This feature isn't available in the demo. Create your own account to use it.");
    return next();
  });
