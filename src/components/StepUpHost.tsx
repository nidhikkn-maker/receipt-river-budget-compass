import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Fingerprint } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { useDevicePasskey } from "@/lib/device-passkey";
import { stepUpWithPassword } from "@/lib/step-up.functions";
import { settleStepUp, subscribeStepUp } from "@/lib/step-up";

/**
 * Re-confirmation for sensitive changes: Face ID / passkey or the account password, verified on the server,
 * which records a five-minute grant. The MPIN is deliberately not offered here (Decision 30).
 */
export function StepUpHost() {
  const [req, setReq] = useState<{ action: string } | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const passkey = useDevicePasskey();
  const withPassword = useServerFn(stepUpWithPassword);
  useEffect(() => subscribeStepUp((p) => { setReq(p); setPassword(""); setError(""); }), []);
  const done = (ok: boolean) => { setPassword(""); setError(""); settleStepUp(ok); };
  const face = async () => {
    setBusy(true); setError("");
    try { await passkey("stepup"); done(true); }
    catch (e) { setError(e instanceof Error && e.message ? `${e.message}. You can use your account password instead.` : "Face ID wasn't completed. Use your account password instead."); }
    finally { setBusy(false); }
  };
  return <Dialog open={!!req} onOpenChange={(open) => { if (!open && req && !busy) done(false); }}>
    <DialogContent onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }} onPointerDownOutside={(e) => { if (busy) e.preventDefault(); }}>
      <DialogHeader>
        <DialogTitle>Confirm it's you</DialogTitle>
        <DialogDescription>This change needs a fresh check. Use Face ID / passkey or your account password; your 4-digit MPIN can't be used for this.</DialogDescription>
      </DialogHeader>
      <Button type="button" disabled={busy} onClick={() => void face()}><Fingerprint className="h-4 w-4" />Use Face ID / passkey</Button>
      <form className="grid gap-3" onSubmit={async (e) => {
        e.preventDefault(); if (!password || busy) return;
        setBusy(true); setError("");
        try { await withPassword({ data: { password } }); done(true); }
        catch (err) { setError(err instanceof Error && err.message ? err.message : "Couldn't verify your password. Try again."); }
        finally { setPassword(""); setBusy(false); }
      }}>
        <Label htmlFor="step-up-password">Account password</Label>
        <Input id="step-up-password" type="password" autoComplete="current-password" value={password} disabled={busy} onChange={(e) => setPassword(e.target.value)} />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => done(false)}>Cancel</Button>
          <Button type="submit" loading={busy} disabled={!password}>Verify password</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
