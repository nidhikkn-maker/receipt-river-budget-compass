import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Fingerprint, Mail } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useDevicePasskey } from "@/lib/device-passkey";
import { requestStepUpEmailCode, stepUpWithEmailCode, stepUpWithPassword } from "@/lib/step-up.functions";
import { settleStepUp, subscribeStepUp } from "@/lib/step-up";
import { REGISTER_PASSKEY_ACTION } from "@/lib/step-up-check";
import { accountProviders } from "@/lib/idle-policy";

/** Which confirmations this account can use. null while unknown: then every method is shown and the server decides. */
type Methods = { password: boolean; passkey: boolean };

async function accountMethods(): Promise<Methods | null> {
  try {
    // Server-validated account (not the device copy): password sign-in exists only with an "email" identity.
    const { data, error } = await supabase.auth.getUser();
    const user = data.user;
    if (error || !user) return null;
    let passkey = true;
    try {
      const r = await supabase.from("device_passkeys").select("credential_id").eq("owner_id", user.id).limit(1);
      passkey = r.error ? true : (r.data?.length ?? 0) > 0;
    } catch { passkey = true; }
    return { password: accountProviders(user).includes("email"), passkey };
  } catch { return null; }
}

/**
 * Re-confirmation for sensitive changes: Face ID / passkey or the account password, verified on the server,
 * which records a five-minute grant. Only for adding a passkey is an emailed one-time code also offered, so
 * accounts without a password (e.g. Google sign-in) can register; that code never confirms anything else.
 * The password is offered only to accounts that have one, and a passkey only when one exists.
 * The MPIN is deliberately never offered here (Decision 30).
 * `onReady` fires once the host is listening, for screens that mount it only for one request (the /auth Face ID offer).
 */
export function StepUpHost({ onReady }: { onReady?: () => void } = {}) {
  const ready = useRef(onReady);
  ready.current = onReady;
  const [req, setReq] = useState<{ action: string } | null>(null);
  const [methods, setMethods] = useState<Methods | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const passkey = useDevicePasskey();
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const withPassword = useServerFn(stepUpWithPassword);
  const sendCode = useServerFn(requestStepUpEmailCode);
  const withCode = useServerFn(stepUpWithEmailCode);
  const registering = req?.action === REGISTER_PASSKEY_ACTION;
  useEffect(() => {
    const off = subscribeStepUp((p) => { setReq(p); setPassword(""); setCode(""); setCodeSent(false); setError(""); });
    ready.current?.();
    return off;
  }, []);
  useEffect(() => {
    if (!req) return;
    let active = true;
    setMethods(null);
    void accountMethods().then((m) => { if (active) setMethods(m); });
    return () => { active = false; };
  }, [req]);
  const showPasskey = methods?.passkey ?? true;
  const showPassword = methods?.password ?? true;
  const done = (ok: boolean) => { setPassword(""); setCode(""); setCodeSent(false); setError(""); settleStepUp(ok); };
  const other = showPassword ? "You can use your account password instead." : registering ? "You can use an emailed code instead." : "";
  const face = async () => {
    setBusy(true); setError("");
    try { await passkey("stepup"); done(true); }
    catch (e) { setError(`${e instanceof Error && e.message ? `${e.message}.` : "Face ID wasn't completed."} ${other}`.trim()); }
    finally { setBusy(false); }
  };
  const nothing = !showPasskey && !showPassword && !registering;
  return <Dialog open={!!req} onOpenChange={(open) => { if (!open && req && !busy) done(false); }}>
    <DialogContent onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }} onPointerDownOutside={(e) => { if (busy) e.preventDefault(); }}>
      <DialogHeader>
        <DialogTitle>Confirm it's you</DialogTitle>
        <DialogDescription>{registering
          ? "Adding Face ID / a passkey needs a fresh check. Use an existing passkey, your account password, or a code we email you; your 4-digit MPIN can't be used for this."
          : "This change needs a fresh check. Use Face ID / passkey or your account password; your 4-digit MPIN can't be used for this."}</DialogDescription>
      </DialogHeader>
      {showPasskey && <Button type="button" disabled={busy} onClick={() => void face()}><Fingerprint className="h-4 w-4" />Use Face ID / passkey</Button>}
      {registering && <form className="grid gap-3" onSubmit={async (e) => {
        e.preventDefault(); if (busy) return;
        setBusy(true); setError("");
        try {
          if (!codeSent) { await sendCode(); setCodeSent(true); }
          else if (code) { await withCode({ data: { code } }); done(true); }
        } catch (err) { setError(err instanceof Error && err.message ? err.message : "Couldn't verify the code. Try again."); }
        finally { setCode(""); setBusy(false); }
      }}>
        {codeSent && <>
          <Label htmlFor="step-up-code">Code from the email</Label>
          <Input id="step-up-code" inputMode="numeric" autoComplete="one-time-code" value={code} disabled={busy} onChange={(e) => setCode(e.target.value)} />
        </>}
        <Button type="submit" variant="outline" disabled={busy || (codeSent && !code)}><Mail className="h-4 w-4" />{codeSent ? "Verify code" : "Email me a code"}</Button>
      </form>}
      {showPassword && <form className="grid gap-3" onSubmit={async (e) => {
        e.preventDefault(); if (!password || busy) return;
        setBusy(true); setError("");
        try { await withPassword({ data: { password } }); done(true); }
        catch (err) { setError(err instanceof Error && err.message ? err.message : "Couldn't verify your password. Try again."); }
        finally { setPassword(""); setBusy(false); }
      }}>
        <Label htmlFor="step-up-password">Account password</Label>
        <Input id="step-up-password" type="password" autoComplete="current-password" value={password} disabled={busy} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" loading={busy} disabled={!password}>Verify password</Button>
      </form>}
      {nothing && <p className="text-sm text-muted-foreground">Add Face ID / a passkey in Settings → Security first (an emailed code can confirm that), then try again.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={() => done(false)}>Cancel</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
