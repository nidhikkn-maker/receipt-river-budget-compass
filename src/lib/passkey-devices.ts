import { supabase } from "@/integrations/supabase/client";
import { isMissingFunction, withStepUp } from "./step-up";
import { ensureStepUp, rpcUntyped } from "./step-up-check";

/**
 * A saved passkey as the database returns it (device_passkeys, keyed by credential_id). `last_used_at` is not
 * in the current schema; it is shown only if a later migration adds it.
 */
export type PasskeyRow = { credential_id: string; created_at: string; transports: unknown; last_used_at?: string | null };

const TRANSPORT_LABEL: Record<string, string> = { internal: "Built into this device", hybrid: "Phone nearby", usb: "USB security key", nfc: "NFC security key", ble: "Bluetooth security key", "smart-card": "Smart card" };

export function transportLabel(transports: unknown) {
  const list = Array.isArray(transports) ? transports.filter((t): t is string => typeof t === "string") : [];
  return list.length ? list.map((t) => TRANSPORT_LABEL[t] ?? t).join(" · ") : "Passkey";
}

/** Short Indian-English date for device lists. */
export const passkeyDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/**
 * Removes one of the caller's passkeys through remove_device_passkey(_credential_id) (step-up guarded,
 * owner-only, exactly one row). Only when the database does not have that function yet (today's
 * production schema) does it fall back to the owner-only direct delete, still after re-confirmation, and
 * then it requires exactly one deleted row. Every other error is shown.
 */
export async function removePasskey(row: PasskeyRow, ownerId: string) {
  await ensureStepUp("remove_device_passkey", { always: true });
  const r = await withStepUp(() => rpcUntyped("remove_device_passkey", { _credential_id: row.credential_id }));
  if (!r.error) return;
  if (!isMissingFunction(r.error)) {
    throw new Error(/passkey not found/i.test(r.error.message) ? "This passkey isn't on your account any more. Refresh the list." : "Couldn't remove this passkey. Please try again.");
  }
  const { data, error } = await supabase.from("device_passkeys").delete().eq("owner_id", ownerId).eq("credential_id", row.credential_id).select("credential_id");
  if (error || (data ?? []).length !== 1) throw new Error("Couldn't remove this passkey. Please try again.");
}
