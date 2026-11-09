import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * A temporary, non-persistent auth client. Anything it verifies stays in memory and is revoked with a local-only
 * sign-out, so device re-verification never replaces the app's session or signs out other devices.
 */
function isolatedAuthClient() {
  const url = import.meta.env['VITE_SUPABASE_URL'];
  const key = import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) throw new Error("Sign-in is unavailable. Please try again when connected.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, flowType: "implicit", storageKey: "ledgerline-device-verification" },
    global: { fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
      headers.set("apikey", key);
      return fetch(input, { ...init, headers });
    } },
  });
}

/** The signed-in, non-guest owner as the server sees it now. */
async function currentOwner(ownerId: string) {
  const { data: current, error } = await supabase.auth.getUser();
  if (error || current.user?.id !== ownerId || !current.user.email || current.user.is_anonymous) {
    throw new Error("Sign out and sign in to your account to continue.");
  }
  return current.user as typeof current.user & { email: string };
}

async function confirmStillOwner(ownerId: string) {
  const { data: active, error: activeError } = await supabase.auth.getUser();
  if (activeError || active.user?.id !== ownerId) throw new Error("Your account changed. Please sign in again.");
}

// Password verification must never replace the active account's session.
export async function verifyDevicePassword(ownerId: string, password: string): Promise<void> {
  const owner = await currentOwner(ownerId);
  const verifier = isolatedAuthClient();
  try {
    const result = await verifier.auth.signInWithPassword({ email: owner.email, password });
    if (result.error || result.data.user?.id !== ownerId) throw new Error("Couldn't verify your password. Try again or sign out and sign in.");
    await confirmStillOwner(ownerId);
  } finally {
    // Local scope revokes only this temporary session, not the app's session.
    await verifier.auth.signOut({ scope: "local" }).catch(() => {});
  }
}

/**
 * Sends a one-time code to the locked owner's own email. It never creates an account (shouldCreateUser: false)
 * and never touches the app's session; the auth service applies its own sending limits.
 */
export async function sendDeviceUnlockCode(ownerId: string): Promise<void> {
  const owner = await currentOwner(ownerId);
  const verifier = isolatedAuthClient();
  const { error } = await verifier.auth.signInWithOtp({ email: owner.email, options: { shouldCreateUser: false } });
  if (error) throw new Error(error.status === 429 ? "Too many codes were requested. Wait a little and try again." : "Couldn't send the code. Check your connection and try again.");
}

/**
 * Checks an emailed code in an isolated client. Unlocks only when the verified account is the locked owner;
 * the temporary session is then revoked locally, so the app session and other devices are untouched.
 */
export async function verifyDeviceUnlockCode(ownerId: string, code: string): Promise<void> {
  const token = code.replace(/\s+/g, "");
  if (!/^\d{6,10}$/.test(token)) throw new Error("Enter the code from your email.");
  const owner = await currentOwner(ownerId);
  const verifier = isolatedAuthClient();
  try {
    const result = await verifier.auth.verifyOtp({ email: owner.email, token, type: "email" });
    if (result.error) throw new Error("That code didn't work. Check it or ask for a new one.");
    if (result.data.user?.id !== ownerId) throw new Error("This code is for a different account. Sign out to switch accounts.");
    await confirmStillOwner(ownerId);
  } finally {
    await verifier.auth.signOut({ scope: "local" }).catch(() => {});
  }
}
