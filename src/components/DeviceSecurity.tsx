import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { KeyRound, LogOut, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store";
import { confirmAction } from "@/lib/confirm";
import { ensureStepUp } from "@/lib/step-up-check";
import { passkeyDate as day, removePasskey, transportLabel, type PasskeyRow } from "@/lib/passkey-devices";

/** Settings → Security: this account's passkeys, with Remove. */
export function PasskeyDevices() {
  const { userId } = useStore();
  const [rows, setRows] = useState<PasskeyRow[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from("device_passkeys").select("*").eq("owner_id", userId).order("created_at", { ascending: false });
    if (e) { setError("Couldn't load your passkeys."); setRows([]); return; }
    setError(""); setRows((data ?? []) as PasskeyRow[]);
  }, [userId]);
  useEffect(() => { void load(); }, [load]);
  return <section aria-labelledby="passkey-devices" className="mb-6">
    <h3 id="passkey-devices" className="mb-2 text-sm font-semibold">Face ID and passkeys on this account</h3>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {rows === null ? <p className="text-sm text-muted-foreground">Loading…</p> : rows.length === 0 ? <p className="text-sm text-muted-foreground">No passkeys yet.</p> :
      <ul className="divide-y rounded-xl border">{rows.map((r) => <li key={r.credential_id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
        <div className="flex min-w-0 items-center gap-2"><KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0"><div className="font-medium">{transportLabel(r.transports)}</div>
            <div className="text-xs text-muted-foreground">Added {day(r.created_at)}{r.last_used_at ? ` · Last used ${day(r.last_used_at)}` : ""}</div></div></div>
        <Button size="sm" variant="ghost" className="text-destructive" aria-label={`Remove passkey added ${day(r.created_at)}`} onClick={async () => {
          if (!await confirmAction({ title: "Remove this passkey?", message: "Face ID / passkey on that device will stop working for this account. You can add it again later.", confirmLabel: "Remove" })) return;
          await removePasskey(r, userId);
          toast.success("Passkey removed");
          await load();
        }}><Trash2 className="h-4 w-4" />Remove</Button>
      </li>)}</ul>}
  </section>;
}

/** Ends every other session of this account after re-confirmation; this device stays signed in. */
export function SignOutOtherDevices() {
  return <section aria-labelledby="other-devices" className="mb-6">
    <h3 id="other-devices" className="mb-2 text-sm font-semibold">Other devices</h3>
    <p className="mb-2 text-xs text-muted-foreground">Signs out every other phone, tablet and browser using this account. This device stays signed in.</p>
    <Button variant="outline" onClick={async () => {
      if (!await confirmAction({ title: "Sign out all other devices?", message: "Other devices will need to sign in again.", confirmLabel: "Sign out others" })) return;
      await ensureStepUp("sign_out_other_devices", { always: true });
      const { error } = await supabase.auth.signOut({ scope: "others" });
      if (error) throw new Error("Couldn't sign out other devices. Please try again.");
      toast.success("Other devices signed out");
    }}><LogOut className="h-4 w-4" />Sign out all other devices</Button>
  </section>;
}

/** How to get back into the account safely. The MPIN never recovers an account. */
export function AccountRecovery() {
  return <section aria-labelledby="account-recovery" className="mb-2">
    <h3 id="account-recovery" className="mb-2 text-sm font-semibold">If you lose access</h3>
    <ul className="mb-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
      <li>Forgot your password: on the sign-in page choose “Forgot password?”. We email a link that opens <Link to="/reset-password" className="underline">Reset password</Link>.</li>
      <li>Lost a phone: sign in on another device, remove that phone's passkey above and sign out all other devices.</li>
      <li>Your 4-digit MPIN only reopens this device. It can't recover your account or confirm sensitive changes.</li>
    </ul>
  </section>;
}
