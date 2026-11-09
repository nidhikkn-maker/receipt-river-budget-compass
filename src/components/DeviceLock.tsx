import { useEffect, useRef, useState, type ReactNode } from "react";
import { ThapalSymbol } from "./ThapalLogo";
import { useServerFn } from "@tanstack/react-start";


import { toast } from "sonner";
import { Fingerprint } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { verifyDevicePassword } from "@/lib/device-reauth";
import { consumeDeviceUnlock } from "@/lib/device-unlock";
import { useIdleLock } from "@/lib/use-idle-lock";

import { useStore } from "@/lib/store";
import { PinPad } from "./PinPad";
import { clearMpin, hasMpin, setMpin, verifyMpin } from "@/lib/mpin";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

export function MpinSettings() {
  const { userId } = useStore();
  const [on, setOn] = useState(false);
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState("");
  const [error, setError] = useState("");
  useEffect(() => setOn(hasMpin(userId)), [userId]);
  const close = () => { setOpen(false); setFirst(""); setError(""); };
  return <div className="mb-6 flex flex-wrap items-center gap-3">
    <Button variant="outline" onClick={() => setOpen(true)}>{on ? "Change 4-digit MPIN" : "Set up 4-digit MPIN"}</Button>
    {on && <Button variant="ghost" onClick={() => { clearMpin(userId); setOn(false); toast.success("MPIN removed from this device"); }}>Remove MPIN</Button>}
    <p className="w-full text-xs text-muted-foreground">The MPIN works only on this device and only after you have signed in. Five wrong tries erase it.</p>
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{first ? "Enter it again" : "Choose a 4-digit MPIN"}</DialogTitle><DialogDescription>Avoid repeated digits or simple sequences like 1234.</DialogDescription></DialogHeader>
        <PinPad key={first ? "confirm" : "choose"} label={first ? "Confirm your MPIN" : "New MPIN"} error={error} onComplete={async (pin) => {
          setError("");
          if (!first) { setFirst(pin); return; }
          if (pin !== first) { setFirst(""); setError("The two PINs didn't match. Start again."); return; }
          try { await setMpin(userId, pin); localStorage.setItem(`ll-lock-${userId}`, "1"); setOn(true); toast.success("MPIN set for this device"); close(); }
          catch (e) { setFirst(""); setError((e as Error).message); }
        }} />
      </DialogContent>
    </Dialog>
  </div>;
}
export { useDevicePasskey } from "@/lib/device-passkey";
import { useDevicePasskey } from "@/lib/device-passkey";
export function PasskeySettings(){const {userId}=useStore();const passkey=useDevicePasskey();return <div className="mb-6 flex flex-wrap gap-3"><Button variant="outline" onClick={async()=>{try{await passkey("register");localStorage.setItem(`ll-lock-${userId}`,"1");toast.success("Face ID / device passkey enabled");}catch(e){toast.error((e as Error).message);}}}><Fingerprint className="h-4 w-4"/>Enable Face ID / device lock</Button><Button variant="ghost" onClick={async()=>{try{await passkey("unlock");localStorage.removeItem(`ll-lock-${userId}`);toast.success("Device lock disabled");}catch(e){toast.error((e as Error).message);}}}>Disable device lock</Button></div>}
export function DeviceLock({ children }: { children: ReactNode }) {
  const { userId } = useStore();
  const passkey = useDevicePasskey();
  const nav = useNavigate();
  const query = useQueryClient();
  const [locked, setLocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [passwordMode, setPasswordMode] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  // The idle lock is mandatory for real accounts. A guest (anonymous) session has no password or account to
  // verify, so it is idle-locked only once it has an MPIN or Face ID lock; otherwise locking would strand it.
  const [idleRequired, setIdleRequired] = useState(false);
  useEffect(() => {
    let live = true;
    void Promise.resolve().then(() => supabase.auth.getSession()).then(({ data }) => {
      const user = data.session?.user;
      if (live) setIdleRequired(!!user && user.id === userId && (!user.is_anonymous || hasMpin(userId) || localStorage.getItem(`ll-lock-${userId}`) === "1"));
    }, () => { if (live) setIdleRequired(false); });
    return () => { live = false; };
  }, [userId]);
  // Locks from inactivity don't open Face ID by themselves; the person chooses how to unlock.
  const autoTried = useRef(false);
  useIdleLock({ ownerId: userId, enabled: ready && idleRequired, locked, onLock: () => { autoTried.current = true; setPassword(""); setPasswordMode(false); setError(""); setLocked(true); } });
  useEffect(() => {
    setLocked(localStorage.getItem(`ll-lock-${userId}`) === "1" && !consumeDeviceUnlock(userId));
    setReady(true); setPassword(""); setPasswordMode(false); setError("");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const change = () => {
      if (document.hidden) timer = setTimeout(() => { if (localStorage.getItem(`ll-lock-${userId}`) === "1") setLocked(true); }, 60000);
      else if (timer) clearTimeout(timer);
    };
    document.addEventListener("visibilitychange", change);
    return () => { if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", change); };
  }, [userId]);
  // Ask for Face ID straight away when the app opens locked; MPIN/password stay available if it's cancelled or fails.
  useEffect(() => {
    if (!locked) { autoTried.current = false; return; }
    if (autoTried.current) return;
    autoTried.current = true;
    setBusy(true);
    passkey("unlock").then(() => setLocked(false), () => setError(hasMpin(userId) ? "Use Face ID, your MPIN or your account password." : "Tap to try Face ID again, or use your account password.")).finally(() => setBusy(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, userId]);
  if (!ready) return null;
  if (!locked) return children;
  const signInAgain = async () => {
    setBusy(true); setError("");
    try {
      await query.cancelQueries(); query.clear();
      const result = await supabase.auth.signOut();
      if (result.error) throw result.error;
      // Keep device lock enabled: returning to this account still requires verification.
      await nav({ to: "/auth", replace: true });
    } catch { setError("Couldn't sign out. Check your connection and try again."); }
    finally { setBusy(false); }
  };
  const face = async () => {
    setBusy(true); setError("");
    try { await passkey("unlock"); setLocked(false); }
    catch { setError("Face ID wasn't completed or isn't available. Use your MPIN or password."); }
    finally { setBusy(false); }
  };
  if (hasMpin(userId) && !passwordMode) return <div className="flex min-h-[80vh] flex-col items-center justify-center gap-2 px-4">
    <ThapalSymbol className="mb-2 h-10 w-auto" />
    <h1 className="mb-2 text-center font-display text-xl font-semibold">Welcome back</h1>
    <PinPad busy={busy} error={error} onFaceId={() => void face()} onComplete={async (pin) => {
      setBusy(true); setError("");
      try { const r = await verifyMpin(userId, pin); if (r.ok) setLocked(false); else if (r.reset) { setError("Too many wrong tries. Use your account password."); setPasswordMode(true); } else setError(`Wrong MPIN. ${r.left} ${r.left === 1 ? "try" : "tries"} left.`); }
      finally { setBusy(false); }
    }} />
    <Button variant="link" disabled={busy} onClick={() => setPasswordMode(true)}>Use account password</Button>
  </div>;
  return <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-4">
    <ThapalSymbol className="h-10 w-auto" />
    <Fingerprint className="h-10 w-10 text-primary" />
    <h1 className="text-center font-display text-2xl font-bold">Thapal is locked</h1>
    <Button disabled={busy} className="max-w-full whitespace-normal" onClick={async () => {
      setBusy(true); setError("");
      try { await passkey("unlock"); setLocked(false); setPassword(""); }
      catch { setError("Face ID wasn't completed or isn't available. Try again, or use your account password."); setPasswordMode(true); }
      finally { setBusy(false); }
    }}>Unlock with Face ID / passkey</Button>
    {error && <p role="alert" className="max-w-sm text-center text-sm text-destructive">{error}</p>}
    {passwordMode ? <form className="grid w-full max-w-sm gap-3" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError("");
      try { await verifyDevicePassword(userId, password); setLocked(false); }
      catch (e) { setError(e instanceof Error ? e.message : "Couldn't verify your password. Try again."); }
      finally { setPassword(""); setBusy(false); }
    }}>
      <Label htmlFor="device-password">Account password</Label>
      <Input id="device-password" type="password" autoComplete="current-password" required value={password} disabled={busy} onChange={e => setPassword(e.target.value)} />
      <Button disabled={busy || !password}>{busy ? "Verifying…" : "Verify password and unlock"}</Button>
    </form> : <Button variant="outline" disabled={busy} onClick={() => setPasswordMode(true)}>Use account password</Button>}
    <Button variant="link" disabled={busy} onClick={() => void signInAgain()}>Sign out and use another sign-in method</Button>
    <p className="max-w-sm text-center text-xs text-muted-foreground">Use your password to unlock this account. If you normally use Google or Lovable, sign out to use that sign-in method. Device lock stays enabled.</p>
  </div>;
}
