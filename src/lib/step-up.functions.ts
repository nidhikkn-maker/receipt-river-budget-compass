import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createAttemptLimiter, verifyPasswordStepUp } from "@/lib/step-up-server";

// Wrong-password counts per user for this server instance. Passwords are never logged or stored.
const limiter = createAttemptLimiter();

/** Re-confirm with the account password. Verification uses an isolated, non-persistent client, so the caller's session never changes. */
export const stepUpWithPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ password: z.string().min(1).max(1024) }).parse(d))
  .handler(async ({ data, context }) => {
    const url = process.env["SUPABASE_URL"], key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) throw new Error("Sign-in is unavailable. Please try again later.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return verifyPasswordStepUp({
      userId: context.userId,
      claims: context.claims,
      password: data.password,
      limiter,
      admin: supabaseAdmin,
      getUser: async () => {
        const { data: u, error } = await context.supabase.auth.getUser();
        return error ? null : u.user;
      },
      verify: async (email, password) => {
        const { createClient } = await import("@supabase/supabase-js");
        const verifier = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storage: undefined },
          global: { fetch: (input, init) => {
            const headers = new Headers(init?.headers);
            if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
            headers.set("apikey", key);
            return fetch(input, { ...init, headers });
          } },
        });
        try {
          const result = await verifier.auth.signInWithPassword({ email, password });
          return result.error ? null : result.data.user?.id ?? null;
        } finally {
          // Local scope ends only this temporary verification session, never the person's other sessions.
          await verifier.auth.signOut({ scope: "local" }).catch(() => {});
        }
      },
    });
  });
