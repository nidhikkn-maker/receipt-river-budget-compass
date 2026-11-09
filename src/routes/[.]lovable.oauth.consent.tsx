import { createFileRoute, redirect } from "@tanstack/react-router";
import { AuthFrame } from "@/components/AuthFrame";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { OwnerLock } from "@/components/OwnerLock";

interface AuthDetails { client?: { name?: string; client_name?: string; redirect_uri?: string } | null; redirect_uri?: string; scope?: string; redirect_url?: string; redirect_to?: string }
interface OAuthResult { data: AuthDetails | null; error: { message: string } | null }
// Small typed wrapper around the beta OAuth helpers on the auth client.
const oauth = (supabase.auth as unknown as { oauth: {
  getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
  approveAuthorization: (id: string) => Promise<OAuthResult>;
  denyAuthorization: (id: string) => Promise<OAuthResult>;
} }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // SSR has no localStorage session and would redirect signed-in users.
  ssr: false,
  head: () => ({ meta: [{ title: "Connect an assistant — Thapal" }, { name: "description", content: "Approve or deny an assistant's access to your Thapal account." }, { property: "og:title", content: "Connect an assistant — Thapal" }, { property: "og:description", content: "Approve or deny access to your account." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ authorization_id: typeof s["authorization_id"] === "string" ? s["authorization_id"] : "" }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("This connection link is missing its authorization code.");
    const { data } = await supabase.auth.getSession();
    if (!data.session || data.session.user.is_anonymous) throw redirect({ to: "/auth", search: { next: location.pathname + location.searchStr } });
  },
  loader: async ({ location }) => {
    const id = new URLSearchParams(location.search).get("authorization_id");
    if (!id) throw new Error("This connection link is missing its authorization code.");
    const { data, error } = await oauth.getAuthorizationDetails(id);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    const { data: u } = await supabase.auth.getUser();
    return { details: data, email: u.user?.email ?? "", ownerId: u.user?.id ?? "" };
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <AuthFrame>
      <h1 className="font-display text-2xl font-bold">Connection request unavailable</h1>
      <p className="mt-3 text-sm text-muted-foreground">{error instanceof Error ? error.message : String(error)}. The link may have expired — start the connection again from your assistant.</p>
    </AuthFrame>
  ),
});

const SCOPE_LABEL: Record<string, string> = { openid: "Confirm who you are", email: "Share your email address", profile: "Share your basic profile" };

function Consent() {
  const { details, email, ownerId } = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = details?.client?.name ?? details?.client?.client_name ?? "An assistant";
  const redirectUri = details?.client?.redirect_uri ?? details?.redirect_uri;
  const scopes = (details?.scope ?? "openid email profile").split(/\s+/).filter(Boolean);
  useEffect(() => setError(null), [authorization_id]);

  async function decide(approve: boolean) {
    setBusy(true); setError(null);
    try {
      const { data, error } = approve ? await oauth.approveAuthorization(authorization_id) : await oauth.denyAuthorization(authorization_id);
      if (error) throw new Error(error.message);
      const target = data?.redirect_url ?? data?.redirect_to;
      if (!target) throw new Error("No redirect was returned. Please try connecting again.");
      window.location.href = target;
    } catch (e) { setBusy(false); setError(`${approve ? "Approval" : "Cancelling"} failed: ${(e as Error).message}`); }
  }

  return (
    <AuthFrame>
      {/* An idle or locked device must be unlocked before it can approve an assistant. */}
      <OwnerLock ownerId={ownerId}>
      <div>
        <h1 className="font-display text-2xl font-bold">Connect {name} to Thapal</h1>
        <p className="mt-2 text-sm">This lets {name} use Thapal as you{email ? <> (<b>{email}</b>)</> : null}.</p>
        {redirectUri && <p className="mt-1 break-all text-xs text-muted-foreground">Returns to {redirectUri}</p>}
        <h2 className="mt-5 text-sm font-semibold">It will be able to</h2>
        <ul className="mt-1 list-disc pl-5 text-sm">
          <li>Read your transactions and monthly spending by category</li>
          <li>Read account balances and upcoming payments</li>
          {scopes.map((s) => <li key={s}>{SCOPE_LABEL[s] ?? `Additional permission requested: ${s}`}</li>)}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">It cannot add, change or delete anything. This does not bypass Thapal's permissions — it only sees your own records.</p>
        {error && <p role="alert" className="mt-3 text-sm font-semibold text-destructive">{error}</p>}
        <div className="mt-5 grid gap-2">
          <Button variant="gold" disabled={busy} onClick={() => decide(true)}>{busy ? "Please wait…" : "Approve"}</Button>
          <Button variant="outline" disabled={busy} onClick={() => decide(false)}>Cancel connection</Button>
        </div>
      </div>
      </OwnerLock>
    </AuthFrame>
  );
}
