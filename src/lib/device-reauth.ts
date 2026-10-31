import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Password verification must never replace the active account's session.
export async function verifyDevicePassword(ownerId: string, password: string): Promise<void> {
  const { data: current, error } = await supabase.auth.getUser();
  if (error || current.user?.id !== ownerId || !current.user.email || current.user.is_anonymous) {
    throw new Error("Sign out and sign in to your account to continue.");
  }
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Sign-in is unavailable. Please try again when connected.");
  const verifier = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "ledgerline-device-verification" },
    global: { fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
      headers.set("apikey", key);
      return fetch(input, { ...init, headers });
    } },
  });
  try {
    const result = await verifier.auth.signInWithPassword({ email: current.user.email, password });
    if (result.error || result.data.user?.id !== ownerId) throw new Error("Couldn't verify your password. Try again or sign out and sign in.");
    const { data: active, error: activeError } = await supabase.auth.getUser();
    if (activeError || active.user?.id !== ownerId) throw new Error("Your account changed. Please sign in again.");
  } finally {
    // Local scope revokes only this temporary session, not the app's session.
    await verifier.auth.signOut({ scope: "local" }).catch(() => {});
  }
}