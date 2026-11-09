import { supabase } from "@/integrations/supabase/client";
import { clearOfflineOwner } from "./offline";
import { clearLocalPreparations } from "./claim-preparations";
import { clearMpin } from "./mpin";
import { forgetActivity } from "./use-idle-lock";

/**
 * Ends an idle guest (anonymous demo) session on this device. A guest has no password or email that could
 * re-verify who is holding the device, so the session is signed out locally and this guest's device copies
 * and lock settings are removed. Sample records on the server are removed by the hourly demo clean-up.
 */
export async function endGuestSession(ownerId: string): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: "local" }).catch((e: unknown) => ({ error: e }));
  if (error) {
    // The sign-in library keeps the saved session when it cannot read it; remove it from this device directly.
    try {
      const key = (supabase.auth as unknown as { storageKey?: string }).storageKey;
      if (key) localStorage.removeItem(key);
    } catch { /* storage blocked */ }
  }
  try { await clearLocalPreparations(ownerId); } catch { /* nothing saved */ }
  try { await clearOfflineOwner(ownerId); } catch { /* nothing saved */ }
  try { clearMpin(ownerId); } catch { /* storage blocked */ }
  forgetActivity(ownerId);
  for (const k of [`ll-lock-${ownerId}`, `ll-face-offer-${ownerId}`]) { try { localStorage.removeItem(k); } catch { /* storage blocked */ } }
}
