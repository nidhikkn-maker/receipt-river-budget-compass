import { confirmAction } from "@/lib/confirm";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ScanFace } from "lucide-react";
import { LedgerlineLogo } from "@/components/LedgerlineLogo";
import kkLogo from "@/assets/kk-monogram-gold.png.asset.json";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import "@lovable.dev/cloud-auth-js/styles.css";
import { oauthReturnPath } from "@/lib/oauth-return-path";
import { useDevicePasskey } from "@/lib/device-passkey";
import { verifyDevicePassword } from "@/lib/device-reauth";
import { rememberDeviceUnlock } from "@/lib/device-unlock";
import { PinPad } from "@/components/PinPad";
import { hasMpin, verifyMpin } from "@/lib/mpin";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { next?: string } => typeof s["next"] === "string" ? { next: s["next"] } : {},
  head: () => ({ meta: [
    { title: "Sign in — Ledgerline" },
    { name: "description", content: "Securely access your Ledgerline financial account with sign-in and Face ID device unlock." },
    { property: "og:title", content: "Sign in — Ledgerline" },
    { property: "og:description", content: "Access your accounts and financial records securely across devices." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Auth,
});
function Auth() {
  const nav = useNavigate();
  const rawNext = Route.useSearch().next;
  const next = rawNext ? oauthReturnPath(rawNext) : null;
  const go = async () => { if (next && next !== "/") { window.location.assign(next); return; } await nav({ to: "/dashboard" }); };
  const back = () => window.location.origin + "/auth" + (next && next !== "/" ? "?next=" + encodeURIComponent(next) : "");
  const query = useQueryClient();
  const passkey = useDevicePasskey();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [anonymous, setAnonymous] = useState(false);
  const [signedEmail, setSignedEmail] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [faceEnabled, setFaceEnabled] = useState(false);
  const [passwordMode, setPasswordMode] = useState(false);
  const [notice, setNotice] = useState("");
  const [faceError, setFaceError] = useState("");
  const [mpinOn, setMpinOn] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoEmail, setDemoEmail] = useState("");
  useEffect(() => {
    let active = true;
    // Paint from the session saved on this device (no network wait), then let the server check correct it.
    const apply = (user: { id: string; email?: string; is_anonymous?: boolean } | null) => {
      if (!active) return;
      setAnonymous(user?.is_anonymous ?? false);
      const e = user?.is_anonymous ? "" : user?.email ?? "";
      setSignedEmail(e); setOwnerId(e ? user?.id ?? "" : "");
      const enabled = Boolean(e && user && localStorage.getItem(`ll-lock-${user.id}`) === "1");
      setFaceEnabled(enabled); setMpinOn(Boolean(e && user && hasMpin(user.id)));
      if (e && !enabled && next && next !== "/") window.location.assign(next);
    };
    void supabase.auth.getSession().then(({ data }) => { apply(data.session?.user ?? null); if (active) setChecking(false); }).catch(() => { if (active) setChecking(false); });
    void supabase.auth.getUser().then(({ data }) => apply(data.user)).catch(() => { if (active) setFaceError("Couldn't check your account. Sign in below to continue."); });
    return () => { active = false; };
  }, [next]);
  const unlock = async (auto = false) => {
    setFaceError("");
    if (!ownerId || !signedEmail) { setFaceError("Sign in with your password or Google first. Face ID unlocks your remembered account; it cannot sign in after you have signed out."); return; }
    setBusy(true);
    try {
      if (!window.isSecureContext || typeof PublicKeyCredential === "undefined" || !await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()) throw Error("unavailable");
      const { data, error } = await supabase.auth.getUser();
      if (error || data.user?.id !== ownerId) throw Error("session");
      await passkey("unlock");
      const current = await supabase.auth.getUser();
      if (current.error || current.data.user?.id !== ownerId) throw Error("session");
      rememberDeviceUnlock(ownerId);
      await go();
    } catch (err) {
      // Stay quiet when this device simply can't offer Face ID; only speak up when a real scan didn't finish.
      const silent = auto && err instanceof Error && err.message === "unavailable";
      if (!silent) setFaceError(auto ? "Face ID didn't complete. Use your MPIN or your account password." : "Face ID wasn't completed or isn't available. Try again, or use your account password.");
      if (!auto) setPasswordMode(true);
    }
    finally { setBusy(false); }
  };
  // Face ID is asked for by itself as soon as this device is recognised — no tap needed.
  const autoTried = useRef(false);
  useEffect(() => {
    if (checking || autoTried.current || anonymous || !faceEnabled || !ownerId) return;
    autoTried.current = true;
    void unlock(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, anonymous, faceEnabled, ownerId]);
  const signOut = async () => {
    setBusy(true);
    try {
      await query.cancelQueries(); query.clear();
      const { error } = await supabase.auth.signOut(); if (error) throw error;
      setSignedEmail(""); setOwnerId(""); setFaceEnabled(false); setPasswordMode(false); setPassword(""); setFaceError("");
      await nav({ to: "/auth", replace: true });
    } catch { toast.error("Couldn't sign out. Please try again."); }
    finally { setBusy(false); }
  };
  // One Face ID scan at the end of an email sign-in means later openings need no taps at all.
  const offerDeviceUnlock = async () => {
    if (faceEnabled || anonymous || signup) return;
    const id = (await supabase.auth.getUser()).data.user?.id;
    if (!id || localStorage.getItem(`ll-face-offer-${id}`)) return;
    if (!await confirmAction("Set up Face ID on this device? Next time Ledgerline opens with one scan — no password needed.")) { localStorage.setItem(`ll-face-offer-${id}`, "later"); return; }
    try { await passkey("register"); localStorage.setItem(`ll-lock-${id}`, "1"); }
    catch { localStorage.setItem(`ll-face-offer-${id}`, "later"); }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      if (signup) {
        if (anonymous) {
          const { error } = await supabase.auth.updateUser({ email, password, data: { full_name: name } }, { emailRedirectTo: back() }); if (error) throw error;
          await supabase.from("profiles").update({ full_name: name }).eq("id", (await supabase.auth.getUser()).data.user?.id ?? "");
          setNotice("Check your email to confirm your account. Your existing records stay with this account.");
        } else {
          const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: back() } }); if (error) throw error;
          if (data.session) await go(); else setNotice("Check your email to confirm your account, then sign in.");
        }
      } else {
        await query.cancelQueries(); query.clear();
        const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) throw error;
        await offerDeviceUnlock();
        await go();
      }
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const startDemo = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      const current = (await supabase.auth.getSession()).data.session?.user;
      if (!current?.is_anonymous) {
        await query.cancelQueries(); query.clear();
        const { error } = await supabase.auth.signInAnonymously(); if (error) throw error;
      }
      const { error } = await supabase.rpc("start_demo_workspace", { _label: demoEmail.trim() }); if (error) throw error;
      await nav({ to: "/dashboard" });
    } catch (e) { toast.error((e as Error).message || "Couldn't open the demo"); } finally { setBusy(false); }
  };
  const social = async (provider: "google" | "lovable") => {
    if (anonymous && !await confirmAction("Social sign-in opens a different account. Download a backup first to keep your existing browser records. Continue?")) return;
    const r = await lovable.auth.signInWithOAuth(provider, { redirect_uri: back() });
    if (r.error) toast.error(r.error.message); else if (!r.redirected) await go();
  };
  const pinUnlock = async (pin: string) => {
    setBusy(true); setFaceError("");
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || data.user?.id !== ownerId) throw Error("session");
      const r = await verifyMpin(ownerId, pin);
      if (r.ok) { rememberDeviceUnlock(ownerId); await go(); return; }
      if (r.reset) { setMpinOn(false); setPasswordMode(true); setFaceError("Too many wrong tries, so the MPIN was removed. Use your account password."); }
      else setFaceError(`Wrong MPIN. ${r.left} ${r.left === 1 ? "try" : "tries"} left.`);
    } catch { setFaceError("Couldn't check your account. Use your account password."); setPasswordMode(true); }
    finally { setBusy(false); }
  };
  return <div className="relative min-h-dvh overflow-hidden bg-gradient-to-b from-secondary/60 via-background to-background">
  <div className="pointer-events-none fixed z-0 flex flex-col items-center gap-1 text-muted-foreground opacity-70" style={{ right: "max(1rem, env(safe-area-inset-right))", bottom: "max(1rem, env(safe-area-inset-bottom))" }}>
    <img src={kkLogo.url} alt="KK monogram" className="size-12 object-contain sm:size-16" />
    <span className="text-[10px] tracking-wide sm:text-xs">A creation by KK</span>
  </div>
  <main className="relative z-10 mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 pb-32 pt-10 sm:pb-24">
    <Link to="/dashboard" aria-label="Ledgerline home" className="mx-auto mb-8 inline-block"><LedgerlineLogo className="h-9 w-auto sm:h-11" /></Link>
    <div className="rounded-3xl border bg-card/95 p-6 shadow-float backdrop-blur sm:p-8">
    <h1 className="mb-1 text-center font-display text-2xl font-semibold">{signedEmail ? "Welcome back" : signup ? "Create your account" : "Sign in"}</h1>
    <p className="mb-6 text-center text-sm text-muted-foreground">{signedEmail ? "Unlock to open your accounts" : signup ? "Start tracking with Ledgerline" : "Your finances, in one place"}</p>
    {checking ? <p role="status" className="text-sm text-muted-foreground">Checking your account…</p> : signedEmail ? <>
      <div className="mb-5 flex items-center justify-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{signedEmail[0]?.toUpperCase()}</span><span className="min-w-0 truncate text-sm">{signedEmail}</span></div>
      {mpinOn && !passwordMode ? <div className="grid gap-2">
        <PinPad busy={busy} error={faceError} {...(faceEnabled ? { onFaceId: () => void unlock() } : {})} onComplete={pinUnlock} />
        <Button variant="link" disabled={busy} onClick={() => setPasswordMode(true)}>Use account password</Button>
        <Button variant="link" disabled={busy} onClick={() => void signOut()}>Sign out</Button>
      </div> : <div className="grid gap-3">
        <Button variant="gold" disabled={busy} className="min-h-12 whitespace-normal" onClick={() => void unlock()}><ScanFace className="h-5 w-5 shrink-0" />{busy ? "Verifying…" : "Unlock with Face ID"}</Button>
        {faceError && <p role="alert" className="text-sm text-destructive">{faceError}</p>}
        {!faceEnabled && !mpinOn && <p className="text-sm text-muted-foreground">Set up a 4-digit MPIN or Face ID in Settings → Security for quick sign-in.</p>}
        {passwordMode ? <form className="grid gap-3" onSubmit={async e => {
          e.preventDefault(); setBusy(true); setFaceError("");
          try { await verifyDevicePassword(ownerId, password); rememberDeviceUnlock(ownerId); await go(); }
          catch (e) { setFaceError(e instanceof Error ? e.message : "Couldn't verify your password."); }
          finally { setPassword(""); setBusy(false); }
        }}><Label htmlFor="unlock-password">Account password</Label><Input id="unlock-password" type="password" autoComplete="current-password" required disabled={busy} value={password} onChange={e => setPassword(e.target.value)} /><Button disabled={busy || !password}>Verify password and open</Button></form> : <Button variant="outline" disabled={busy} onClick={() => faceEnabled ? setPasswordMode(true) : void go()}>{faceEnabled ? "Use account password" : "Open Ledgerline"}</Button>}
        <Button variant="link" disabled={busy} onClick={() => void signOut()}>Sign out and use another sign-in method</Button>
      </div>}
    </> : <>
      {!signup && <div className="mb-5 grid gap-3"><Button variant="gold" disabled={busy} className="min-h-12 whitespace-normal" onClick={() => void unlock()}><ScanFace className="h-5 w-5 shrink-0" />Face ID</Button><div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or use email<span className="h-px flex-1 bg-border" /></div></div>}
      {faceError && <p role="alert" className="mb-4 text-sm text-destructive">{faceError}</p>}
      <form onSubmit={submit} className="grid gap-4">
        {signup && <div className="grid gap-1"><Label htmlFor="display-name">Display name</Label><Input id="display-name" value={name} onChange={e => setName(e.target.value)} required /></div>}
        <div className="grid gap-1"><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div className="grid gap-1"><Label htmlFor="password">Password</Label><Input id="password" type="password" autoComplete={signup ? "new-password" : "current-password"} minLength={8} required value={password} onChange={e => setPassword(e.target.value)} /></div>
        <Button disabled={busy} className="min-h-11">{busy ? "Please wait…" : signup ? "Create account" : "Sign in"}</Button>
        {notice && <p role="status" className="text-sm text-success">{notice}</p>}
      </form>
      <div className="mt-4 grid gap-2"><Button variant="outline" disabled={busy} onClick={() => social("google")}>Continue with Google</Button><Button className="lovable-auth-button" disabled={busy} onClick={() => social("lovable")}>Continue with Lovable</Button></div>
      <div className="my-1" />
      <div className="mt-4 flex flex-wrap justify-between gap-2"><Button variant="link" onClick={() => { setSignup(!signup); setNotice(""); setFaceError(""); }}>{signup ? "Already have an account?" : "Create an account"}</Button><Button variant="link" onClick={async () => { if (!email) { toast.error("Enter your email first"); return; } const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/reset-password" }); if (error) toast.error(error.message); else setNotice("Check your email for the password reset link."); }}>Forgot password?</Button></div>
      <div className="mt-5 rounded-2xl border border-dashed bg-muted/40 p-4">
        {demoOpen ? <form className="grid gap-2" onSubmit={startDemo}>
          <Label htmlFor="demo-email">Your email (any address, not verified)</Label>
          <Input id="demo-email" type="email" autoComplete="email" required maxLength={254} value={demoEmail} onChange={e => setDemoEmail(e.target.value)} />
          <Button variant="gold" disabled={busy} className="min-h-11">{busy ? "Opening demo…" : "Open the live demo"}</Button>
        </form> : <Button variant="outline" disabled={busy} className="min-h-11 w-full" onClick={() => setDemoOpen(true)}>Try the live demo</Button>}
        <p className="mt-2 text-center text-xs text-muted-foreground">Sample data only, nothing is saved to a real account.</p>
      </div>
      {anonymous && <p className="mt-4 text-xs text-muted-foreground">Create an email account to keep this browser’s records. Social sign-in may open a separate account; back up first.</p>}
    </>}
    </div>
  </main>
  </div>;
}
