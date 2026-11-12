import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { useAppLocked } from "@/lib/app-lock-state";
import { toast } from "sonner";
import { Fingerprint } from "lucide-react";
import { Button } from "./ui/button";
import { useStore } from "@/lib/store";
import { PinPad } from "./PinPad";
import { clearMpin, hasMpin, setMpin } from "@/lib/mpin";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { OwnerLock } from "./OwnerLock";

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
/**
 * The inactivity and device lock for the signed-in owner of the app's data. Rules live in OwnerLock.
 * While locked (UIX §16.4, P0-029) browser Back/Forward and in-app navigation are held, so nothing underneath is
 * revealed or changed; a deep link opened while locked stays on the lock and shows its page only after unlock. Unlock
 * refetches the owner's data and re-runs the route checks before the page renders again.
 */
export function DeviceLock({ children }: { children: ReactNode }) {
  const { userId, refresh } = useStore();
  const router = useRouter();
  const locked = useAppLocked();
  useEffect(() => (locked ? router.history.block({ blockerFn: () => true, enableBeforeUnload: false }) : undefined), [locked, router]);
  // A failed refetch is reported by the store (syncState / readFailure / areaStatus 'failed'); settled here, no toast.
  const onUnlock = useCallback(() => { void refresh().catch(() => {}); void router.invalidate(); }, [refresh, router]);
  return <OwnerLock ownerId={userId} onUnlock={onUnlock}>{children}</OwnerLock>;
}

export { OwnerLock };
