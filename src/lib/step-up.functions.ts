import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createSharedStepUpLimiter, fallbackStepUpLimiter, requestEmailCodeStepUp, verifyEmailCodeStepUp, verifyPasswordStepUp } from "@/lib/step-up-server";

// Failed confirmations are counted in the database (begin_step_up_attempt / finish_step_up_attempt), shared by
// every server instance and request. On a database without those functions (today's production schema) the
// limiter falls back to the per-instance in-memory count. Passwords and codes are never logged or stored.

/** A non-persistent Supabase client used only to verify a credential; it never shares or changes the caller's session. */
async function isolatedAuthClient() {
  const url = process.env["SUPABASE_URL"], key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Sign-in is unavailable. Please try again later.");
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storage: undefined },
    global: { fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
      headers.set("apikey", key);
      return fetch(input, { ...init, headers });
    } },
  });
}

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type AuthContext = { supabase: { auth: { getUser: () => Promise<{ data: { user: { id: string; email?: string | null; is_anonymous?: boolean | null } | null }; error: unknown }> } } };
const callerUser = (context: AuthContext) => async () => {
  const { data: u, error } = await context.supabase.auth.getUser();
  return error ? null : u.user;
};

/** Re-confirm with the account password. Verification uses an isolated, non-persistent client, so the caller's session never changes. */
export const stepUpWithPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ password: z.string().min(1).max(1024) }).parse(d))
  .handler(async ({ data, context }) => {
    const verifier = await isolatedAuthClient();
    const admin = await adminClient();
    return verifyPasswordStepUp({
      userId: context.userId,
      claims: context.claims,
      password: data.password,
      limiter: createSharedStepUpLimiter(admin, fallbackStepUpLimiter),
      admin,
      getUser: callerUser(context),
      verify: async (email, password) => {
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

/**
 * Sends a one-time code to the account's own email, for accounts without a password (e.g. Google sign-in).
 * The code only ever confirms passkey registration. Never creates an account.
 */
export const requestStepUpEmailCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sender = await isolatedAuthClient();
    return requestEmailCodeStepUp({
      userId: context.userId,
      claims: context.claims,
      getUser: callerUser(context),
      send: async (email) => {
        const { error } = await sender.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
        if (error) throw error;
      },
    });
  });

/** Verifies the emailed code on an isolated client and records a five-minute grant for passkey registration only. */
export const stepUpWithEmailCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().min(1).max(32) }).parse(d))
  .handler(async ({ data, context }) => {
    const verifier = await isolatedAuthClient();
    const admin = await adminClient();
    return verifyEmailCodeStepUp({
      userId: context.userId,
      claims: context.claims,
      code: data.code,
      limiter: createSharedStepUpLimiter(admin, fallbackStepUpLimiter),
      admin,
      getUser: callerUser(context),
      verifyCode: async (email, code) => {
        try {
          const result = await verifier.auth.verifyOtp({ email, token: code, type: "email" });
          return result.error ? null : result.data.user?.id ?? null;
        } finally {
          await verifier.auth.signOut({ scope: "local" }).catch(() => {});
        }
      },
    });
  });
