import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ScanFace } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import "@lovable.dev/cloud-auth-js/styles.css";
import { oauthReturnPath } from "@/lib/oauth-return-path";
import { useDevicePasskey } from "@/components/DeviceLock";
import { verifyDevicePassword } from "@/lib/device-reauth";
import { rememberDeviceUnlock } from "@/lib/device-unlock";

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
  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const user = data.user;
      setAnonymous(user?.is_anonymous ?? false);
      const e = user?.is_anonymous ? "" : user?.email ?? "";
      setSignedEmail(e); setOwnerId(e ? user?.id ?? "" : "");
      const enabled = Boolean(e && user && localStorage.getItem(`ll-lock-${user.id}`) === "1");
      setFaceEnabled(enabled);
      if (e && !enabled && next && next !== "/") window.location.assign(next);
    }).catch(() => { if (active) setFaceError("Couldn't check your account. Sign in below to continue."); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [next]);
  const unlock = async () => {
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
    } catch { setFaceError("Face ID wasn't completed or isn't available. Try again, or use your account password."); setPasswordMode(true); }
    finally { setBusy(false); }
  };
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
        await go();
      }
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const social = async (provider: "google" | "lovable") => {
    if (anonymous && !window.confirm("Social sign-in opens a different account. Download a backup first to keep your existing browser records. Continue?")) return;
    const r = await lovable.auth.signInWithOAuth(provider, { redirect_uri: back() });
    if (r.error) toast.error(r.error.message); else if (!r.redirected) await go();
  };
  return <main className="mx-auto max-w-md px-6 py-12">
    <Link to="/dashboard" className="font-display text-2xl font-bold text-primary">Ledgerline</Link>
    <h1 className="mb-5 mt-8 font-display text-3xl font-bold">{signedEmail ? "Welcome back" : signup ? "Create your account" : "Sign in"}</h1>
    {checking ? <p role="status" className="text-sm text-muted-foreground">Checking your account…</p> : signedEmail ? <>
      <p className="mb-5 break-words text-sm">{signedEmail}</p>
      <div className="grid gap-3">
        <Button variant="gold" disabled={busy} className="min-h-12 whitespace-normal" onClick={() => void unlock()}><ScanFace className="h-5 w-5 shrink-0" />{busy ? "Verifying…" : "Unlock with Face ID"}</Button>
        {faceError && <p role="alert" className="text-sm text-destructive">{faceError}</p>}
        {!faceEnabled && <p className="text-sm text-muted-foreground">Enable Face ID in Settings after opening your account.</p>}
        {passwordMode ? <form className="grid gap-3" onSubmit={async e => {
          e.preventDefault(); setBusy(true); setFaceError("");
          try { await verifyDevicePassword(ownerId, password); rememberDeviceUnlock(ownerId); await go(); }
          catch (e) { setFaceError(e instanceof Error ? e.message : "Couldn't verify your password."); }
          finally { setPassword(""); setBusy(false); }
        }}><Label htmlFor="unlock-password">Account password</Label><Input id="unlock-password" type="password" autoComplete="current-password" required disabled={busy} value={password} onChange={e => setPassword(e.target.value)} /><Button disabled={busy || !password}>Verify password and open</Button></form> : <Button variant="outline" disabled={busy} onClick={() => faceEnabled ? setPasswordMode(true) : void go()}>{faceEnabled ? "Use account password" : "Open Ledgerline"}</Button>}
        <Button variant="link" disabled={busy} onClick={() => void signOut()}>Sign out and use another sign-in method</Button>
      </div>
    </> : <>
      {!signup && <div className="mb-5 grid gap-3"><Button variant="gold" disabled={busy} className="min-h-12 whitespace-normal" onClick={() => void unlock()}><ScanFace className="h-5 w-5 shrink-0" />Face ID</Button><p className="text-sm text-muted-foreground">Face ID is available when this device remembers your signed-in account.</p></div>}
      {faceError && <p role="alert" className="mb-4 text-sm text-destructive">{faceError}</p>}
      <form onSubmit={submit} className="grid gap-4">
        {signup && <div className="grid gap-1"><Label htmlFor="display-name">Display name</Label><Input id="display-name" value={name} onChange={e => setName(e.target.value)} required /></div>}
        <div className="grid gap-1"><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div className="grid gap-1"><Label htmlFor="password">Password</Label><Input id="password" type="password" autoComplete={signup ? "new-password" : "current-password"} minLength={8} required value={password} onChange={e => setPassword(e.target.value)} /></div>
        <Button disabled={busy}>{busy ? "Please wait…" : signup ? "Create account" : "Sign in"}</Button>
        {notice && <p role="status" className="text-sm text-success">{notice}</p>}
      </form>
      <div className="mt-4 grid gap-2"><Button variant="outline" disabled={busy} onClick={() => social("google")}>Continue with Google</Button><Button className="lovable-auth-button" disabled={busy} onClick={() => social("lovable")}>Continue with Lovable</Button></div>
      <div className="mt-4 flex flex-wrap justify-between gap-2"><Button variant="link" onClick={() => { setSignup(!signup); setNotice(""); setFaceError(""); }}>{signup ? "Already have an account?" : "Create an account"}</Button><Button variant="link" onClick={async () => { if (!email) { toast.error("Enter your email first"); return; } const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/reset-password" }); if (error) toast.error(error.message); else setNotice("Check your email for the password reset link."); }}>Forgot password?</Button></div>
      {anonymous && <p className="mt-4 text-xs text-muted-foreground">Create an email account to keep this browser’s records. Social sign-in may open a separate account; back up first.</p>}
      <Button asChild variant="link" className="mt-4"><Link to="/dashboard">Back to Ledgerline</Link></Button>
    </>}
  </main>;
}
