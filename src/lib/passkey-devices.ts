import { supabase } from "@/integrations/supabase/client";
import { isMissingFunction, withStepUp } from "./step-up";
import { ensureStepUp, rpcUntyped } from "./step-up-check";

/** A saved passkey as the database returns it. `id` and `last_used_at` exist only once the Phase 1 schema is applied. */
export type PasskeyRow = { credential_id: string; created_at: string; transports: unknown; id?: string | null; last_used_at?: string | null };

const TRANSPORT_LABEL: Record<string, string> = { internal: "Built into this device", hybrid: "Phone nearby", usb: "USB security key", nfc: "NFC security key", ble: "Bluetooth security key", "smart-card": "Smart card" };

export function transportLabel(transports: unknown) {
  const list = Array.isArray(transports) ? transports.filter((t): t is string => typeof t === "string") : [];
  return list.length ? list.map((t) => TRANSPORT_LABEL[t] ?? t).join(" · ") : "Passkey";
}

/** Short Indian-English date for device lists. */
export const passkeyDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/**
 * Removes one of the caller's passkeys. Uses remove_device_passkey (guarded by step-up in the database);
 * on a database without it, the app still asks for re-confirmation and deletes through the owner-only policy.
 */
export async function removePasskey(row: PasskeyRow, ownerId: string) {
  await ensureStepUp("remove_device_passkey", { always: true });
  if (row.id) {
    const r = await withStepUp(() => rpcUntyped("remove_device_passkey", { _id: row.id }));
    if (!r.error) return;
    if (!isMissingFunction(r.error)) throw new Error("Couldn't remove this passkey. Please try again.");
  }
  const { error } = await supabase.from("device_passkeys").delete().eq("owner_id", ownerId).eq("credential_id", row.credential_id);
  if (error) throw new Error("Couldn't remove this passkey. Please try again.");
}
