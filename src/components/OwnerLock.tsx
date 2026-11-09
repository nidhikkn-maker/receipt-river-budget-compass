import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { Fingerprint, Mail } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ThapalSymbol } from "./ThapalLogo";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { PinPad } from "./PinPad";
import { supabase } from "@/integrations/supabase/client";
import { sendDeviceUnlockCode, verifyDevicePassword, verifyDeviceUnlockCode } from "@/lib/device-reauth";
import { consumeDeviceUnlock } from "@/lib/device-unlock";
import { useDevicePasskey } from "@/lib/device-passkey";
import { endGuestSession } from "@/lib/guest-session";
import { accountProviders, codeResendWaitMs, fullUnlockMethods, guestIdleOutcome, idleLimitMs, lastKnownActivity, maskEmail, readViewport, shouldLockOnStart, unlockMethodsFor, type UnlockFacts, type UnlockMethod } from "@/lib/idle-policy";
import { hasMpin, verifyMpin } from "@/lib/mpin";
import { readLastActivity, recordActivity, useIdleLock } from "@/lib/use-idle-lock";

const lockFlag = (ownerId: string) => { try { return localStorage.getItem(`ll-lock-${ownerId}`) === "1"; } catch { return false; } };
const pinSaved = (ownerId: string) => { try { return hasMpin(ownerId); } catch { return false; } };

/** When an email code was last sent for each owner in this tab, so reloading the lock screen keeps the wait. */
const codeSentKey = (ownerId: string) => `ll-code-sent-${ownerId}`;
const codeSentAt = {
  get(ownerId: string) { try { const v = Number(sessionStorage.getItem(codeSentKey(ownerId))); return v > 0 ? v : null; } catch { return null; } },
  has(ownerId: string) { return this.get(ownerId) != null; },
  set(ownerId: string, at: number) { try { sessionStorage.setItem(codeSentKey(ownerId), String(at)); } catch { /* storage blocked */ } },
  delete(ownerId: string) { try { sessionStorage.removeItem(codeSentKey(ownerId)); } catch { /* storage blocked */ } },
};

/** The signed-in account as the server sees it now; null when it can't be checked in time or is someone else. */
async function serverUser(ownerId: string, waitMs = 4000): Promise<User | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((r) => { timer = setTimeout(() => r(null), waitMs); });
  const live = Promise.resolve().then(() => supabase.auth.getUser()).then(({ data, error }) => (!error && data.user?.id === ownerId ? data.user : null), () => null);
  try { return await Promise.race([live, timeout]); } finally { if (timer) clearTimeout(timer); }
}

/** The account saved on this device; used only to describe it (guest or not), never to decide that it is fresh. */
async function savedUser(ownerId: string): Promise<User | null> {
  try { const { data } = await supabase.auth.getSession(); const u = data.session?.user; return u?.id === ownerId ? u : null; } catch { return null; }
}

type Facts = Omit<UnlockFacts, "hasMpin">;
const NO_FACTS: Facts = { isAnonymous: false, email: null, hasPassword: false, hasPasskey: false };

async function loadFacts(ownerId: string, user: User | null): Promise<Facts> {
  const isAnonymous = Boolean(user?.is_anonymous);
  let hasPasskey = lockFlag(ownerId);
  if (!hasPasskey) {
    try {
      const { data, error } = await supabase.from("device_passkeys").select("credential_id").eq("owner_id", ownerId).limit(1);
      // If the list can't be read, still offer passkeys to accounts (the server decides); a guest needs proof.
      hasPasskey = error ? !isAnonymous : (data?.length ?? 0) > 0;
    } catch { hasPasskey = !isAnonymous; }
  }
  return { isAnonymous, email: isAnonymous ? null : user?.email ?? null, hasPassword: accountProviders(user).includes("email"), hasPasskey };
}

const METHOD_HINT: Record<Exclude<UnlockMethod, "pin">, string> = { passkey: "Face ID / passkey", password: "your account password", "email-code": "a code sent to your email" };
function otherWaysHint(methods: UnlockMethod[]) {
  const names = methods.filter((m): m is Exclude<UnlockMethod, "pin"> => m !== "pin").map((m) => METHOD_HINT[m]);
  if (!names.length) return "";
  return names.length === 1 ? `Use ${names[0]}.` : `Use ${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}.`;
}

type Screen = "pin" | "choose" | "password" | "code";

/**
 * Inactivity and device lock for one signed-in owner. Locks after 5 idle minutes on phones / narrow screens and
 * 15 on computers for every session (accounts and guests), whether or not device lock is switched on, and also
 * when the app is reopened after that long. Unlock only reopens this session; it never signs in or recovers.
 */
export function OwnerLock({ ownerId, children }: { ownerId: string; children: ReactNode }) {
  const passkey = useDevicePasskey();
  const nav = useNavigate();
  const query = useQueryClient();
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const [ending, setEnding] = useState(false);
  const [facts, setFacts] = useState<Facts | null>(null);
  const [screen, setScreen] = useState<Screen>("choose");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const factsRef = useRef<Facts | null>(null);
  const autoPasskey = useRef(false);
  const passkeyRef = useRef(passkey);
  useEffect(() => { passkeyRef.current = passkey; });

  const endGuest = useCallback(async () => {
    setEnding(true); setLocked(true);
    try { await query.cancelQueries(); query.clear(); } catch { /* nothing to cancel */ }
    await endGuestSession(ownerId);
    try { await nav({ to: "/auth", search: { ended: "guest-idle" }, replace: true }); }
    catch { window.location.assign("/auth?ended=guest-idle"); }
  }, [ownerId, nav, query]);

  /** Shows the lock (or ends a guest session that nothing could reopen). `resume` offers Face ID straight away. */
  const lockWith = useCallback((f: Facts, resume: boolean) => {
    if (guestIdleOutcome({ ...f, hasMpin: pinSaved(ownerId) }) === "end-session") { void endGuest(); return; }
    factsRef.current = f; setFacts(f);
    autoPasskey.current = resume && f.hasPasskey;
    setPassword(""); setCode(""); setCodeSent(false); setError(""); setBusy(false);
    setScreen(pinSaved(ownerId) ? "pin" : "choose");
    setLocked(true);
  }, [ownerId, endGuest]);
  const lockRef = useRef(lockWith);
  useEffect(() => { lockRef.current = lockWith; });

  const lockNow = useCallback((resume: boolean) => {
    setLocked(true); // hide the app at once; the unlock choices follow
    const known = factsRef.current;
    if (known) { lockRef.current(known, resume); return; }
    void (async () => lockRef.current(await loadFacts(ownerId, (await serverUser(ownerId)) ?? (await savedUser(ownerId))), resume))();
  }, [ownerId]);

  const opened = useCallback(() => {
    recordActivity(ownerId);
    setLocked(false); setError(""); setPassword(""); setCode(""); setCodeSent(false);
  }, [ownerId]);

  // Fresh start: decide from how long this device has been away, not from when this screen mounted.
  useEffect(() => {
    let live = true;
    setReady(false); setLocked(false); setEnding(false); setFacts(null); factsRef.current = null;
    void (async () => {
      const startedAt = Date.now();
      const handoff = consumeDeviceUnlock(ownerId);
      const lastActivity = readLastActivity(ownerId, startedAt);
      const local = await savedUser(ownerId);
      let fresh: User | null | undefined;
      let lock = false;
      let since: number | null = startedAt;
      if (!handoff && lockFlag(ownerId)) lock = true;
      else if (!handoff) {
        // Only the server's sign-in time counts when this device has no activity record.
        if (lastActivity == null) fresh = await serverUser(ownerId);
        const evidence = { now: startedAt, lastActivity, lastSignInAt: fresh?.last_sign_in_at ?? null };
        lock = shouldLockOnStart({ ...evidence, limitMs: idleLimitMs(readViewport(window)) });
        since = lastKnownActivity(evidence);
      }
      if (!live) return;
      if (!lock) {
        if (since != null) recordActivity(ownerId, since);
        setReady(true);
        const f = await loadFacts(ownerId, fresh ?? local);
        if (live) { factsRef.current = f; setFacts(f); }
        return;
      }
      const f = await loadFacts(ownerId, (fresh === undefined ? await serverUser(ownerId) : fresh) ?? local);
      if (!live) return;
      lockRef.current(f, true);
      setReady(true);
    })();
    return () => { live = false; };
  }, [ownerId]);

  // With device lock switched on, leaving the app for a minute also locks it.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const change = () => {
      if (document.hidden) timer = setTimeout(() => { if (lockFlag(ownerId)) lockNow(true); }, 60000);
      else if (timer) clearTimeout(timer);
    };
    document.addEventListener("visibilitychange", change);
    return () => { if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", change); };
  }, [ownerId, lockNow]);

  // Mandatory for every session, guests included, and whether or not device lock is switched on.
  useIdleLock({ ownerId, enabled: ready && !ending, locked, onLock: () => lockNow(false) });

  // Ask for Face ID straight away when the app opens locked; inactivity locks wait for the person to choose.
  useEffect(() => {
    if (!locked || ending || !autoPasskey.current) return;
    autoPasskey.current = false;
    setBusy(true);
    passkeyRef.current("unlock").then(opened, () => setError("Face ID didn't complete. Tap to try again or use another way.")).finally(() => setBusy(false));
  }, [locked, ending, facts, opened]);

  const waitMs = codeResendWaitMs(codeSentAt.get(ownerId), now);
  useEffect(() => {
    if (!locked || screen !== "code" || waitMs <= 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [locked, screen, waitMs]);

  if (!ready) return null;
  if (ending) return <p role="status" className="flex min-h-[60vh] items-center justify-center px-4 text-center text-sm text-muted-foreground">Ending guest session…</p>;
  if (!locked) return children;

  const f = facts ?? NO_FACTS;
  const methods = unlockMethodsFor({ ...f, hasMpin: pinSaved(ownerId) });
  const full = fullUnlockMethods({ ...f, hasMpin: false });
  const show = (s: Screen) => { setError(""); setScreen(s); if (s === "code") { setNow(Date.now()); setCodeSent(codeSentAt.has(ownerId)); } };

  const signOut = async () => {
    if (f.isAnonymous) { await endGuest(); return; }
    setBusy(true); setError("");
    try {
      await query.cancelQueries(); query.clear();
      // Local only: someone holding this locked device can't sign the owner out of other devices.
      const result = await supabase.auth.signOut({ scope: "local" });
      if (result.error) throw result.error;
      // Keep device lock enabled: returning to this account still requires verification.
      await nav({ to: "/auth", replace: true });
    } catch { setError("Couldn't sign out. Check your connection and try again."); }
    finally { setBusy(false); }
  };
  const face = async () => {
    setBusy(true); setError("");
    try { await passkey("unlock"); opened(); }
    catch { setError(full.length > 1 ? "Face ID wasn't completed or isn't available. Try again or use another way." : "Face ID wasn't completed or isn't available. Try again."); }
    finally { setBusy(false); }
  };
  const onPin = async (pin: string) => {
    setBusy(true); setError("");
    try {
      const r = await verifyMpin(ownerId, pin);
      if (r.ok) { opened(); return; }
      if (!r.reset) { setError(`Wrong MPIN. ${r.left} ${r.left === 1 ? "try" : "tries"} left.`); return; }
      // Five wrong tries erase the MPIN: only a full method (never another PIN) can reopen the app now.
      if (!full.length) {
        if (f.isAnonymous) { await endGuest(); return; }
        setScreen("choose"); setError("Too many wrong tries, so the MPIN was removed. Sign out and sign in again.");
        return;
      }
      setScreen("choose"); setError(`Too many wrong tries, so the MPIN was removed. ${otherWaysHint(full)}`);
    } finally { setBusy(false); }
  };
  const sendCode = async () => {
    if (codeResendWaitMs(codeSentAt.get(ownerId), Date.now()) > 0) return;
    setBusy(true); setError("");
    try { await sendDeviceUnlockCode(ownerId); codeSentAt.set(ownerId, Date.now()); setNow(Date.now()); setCodeSent(true); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't send the code. Try again."); }
    finally { setBusy(false); }
  };

  if (screen === "pin" && methods.includes("pin")) return <div className="flex min-h-[80vh] flex-col items-center justify-center gap-2 px-4">
    <ThapalSymbol className="mb-2 h-10 w-auto" />
    <h1 className="mb-2 text-center font-display text-xl font-semibold">Welcome back</h1>
    <PinPad busy={busy} error={error} {...(methods.includes("passkey") ? { onFaceId: () => void face() } : {})} onComplete={onPin} />
    {full.length > 0 && <Button variant="link" disabled={busy} onClick={() => show("choose")}>Use another way</Button>}
    <Button variant="link" disabled={busy} onClick={() => void signOut()}>{f.isAnonymous ? "End guest session" : "Sign out"}</Button>
  </div>;

  return <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-4">
    <ThapalSymbol className="h-10 w-auto" />
    <Fingerprint className="h-10 w-10 text-primary" />
    <h1 className="text-center font-display text-2xl font-bold">Thapal is locked</h1>
    {methods.includes("passkey") && <Button disabled={busy} className="max-w-full whitespace-normal" onClick={() => void face()}>Unlock with Face ID / passkey</Button>}
    {error && <p role="alert" className="max-w-sm text-center text-sm text-destructive">{error}</p>}
    {methods.includes("password") && (screen === "password" ? <form className="grid w-full max-w-sm gap-3" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError("");
      try { await verifyDevicePassword(ownerId, password); opened(); }
      catch (err) { setError(err instanceof Error ? err.message : "Couldn't verify your password. Try again."); }
      finally { setPassword(""); setBusy(false); }
    }}>
      <Label htmlFor="device-password">Account password</Label>
      <Input id="device-password" type="password" autoComplete="current-password" required value={password} disabled={busy} onChange={e => setPassword(e.target.value)} />
      <Button disabled={busy || !password}>{busy ? "Verifying…" : "Verify password and unlock"}</Button>
    </form> : <Button variant="outline" disabled={busy} onClick={() => show("password")}>Use account password</Button>)}
    {methods.includes("email-code") && f.email && (screen === "code" ? <form className="grid w-full max-w-sm gap-3" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError("");
      try { await verifyDeviceUnlockCode(ownerId, code); codeSentAt.delete(ownerId); opened(); }
      catch (err) { setError(err instanceof Error ? err.message : "That code didn't work. Try again."); }
      finally { setCode(""); setBusy(false); }
    }}>
      {codeSent ? <>
        <Label htmlFor="device-code">Code sent to {maskEmail(f.email)}</Label>
        <Input id="device-code" inputMode="numeric" autoComplete="one-time-code" maxLength={10} required value={code} disabled={busy} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} />
        <Button disabled={busy || code.length < 6}>{busy ? "Verifying…" : "Verify code and unlock"}</Button>
        <Button type="button" variant="ghost" disabled={busy || waitMs > 0} onClick={() => void sendCode()}>{waitMs > 0 ? `Send a new code in ${Math.ceil(waitMs / 1000)} s` : "Send a new code"}</Button>
      </> : <>
        <p className="text-center text-sm text-muted-foreground">We'll email a one-time code to {maskEmail(f.email)}.</p>
        <Button type="button" disabled={busy || waitMs > 0} onClick={() => void sendCode()}>{waitMs > 0 ? `Send a code in ${Math.ceil(waitMs / 1000)} s` : "Email me a code"}</Button>
      </>}
    </form> : <Button variant="outline" disabled={busy} onClick={() => show("code")}><Mail className="h-4 w-4" />Get a code by email</Button>)}
    {methods.includes("pin") && <Button variant="link" disabled={busy} onClick={() => show("pin")}>Use MPIN</Button>}
    <Button variant="link" disabled={busy} onClick={() => void signOut()}>{f.isAnonymous ? "End guest session" : "Sign out"}</Button>
    <p className="max-w-sm text-center text-xs text-muted-foreground">{f.isAnonymous
      ? "A guest session can't be recovered. Ending it removes this device's guest data."
      : "Can't unlock? Sign out, then use “Forgot password?” or Continue with Google on the sign-in page. The MPIN can't recover an account."}</p>
  </div>;
}
