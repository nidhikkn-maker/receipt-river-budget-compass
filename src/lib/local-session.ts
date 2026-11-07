import { supabase } from "@/integrations/supabase/client";

/* Offline (or on a very slow connection) the sign-in library tries to renew an expired session over the
   network and keeps retrying, which left the app stuck on its loading screen. Read the saved session from
   this device instead; the server still checks every request once the connection is back. */
function storedUserId(): string | null {
  try {
    const key = (supabase.auth as unknown as { storageKey?: string }).storageKey;
    if (!key) return null;
    const raw = window.localStorage.getItem(key);
    const id = raw ? (JSON.parse(raw) as { user?: { id?: string } }).user?.id : null;
    return typeof id === "string" && id ? id : null;
  } catch { return null; }
}

export async function localSessionUserId(): Promise<string | null> {
  const stored = storedUserId();
  if (!navigator.onLine && stored) return stored;
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 4000));
  const live = supabase.auth.getSession().then(({ data }) => data.session?.user?.id ?? null).catch(() => null);
  const id = await Promise.race([live, timeout]);
  return id ?? stored;
}
