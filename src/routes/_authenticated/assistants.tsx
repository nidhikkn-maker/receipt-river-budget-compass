import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Bot, Loader2, ShieldOff } from "lucide-react";
import { PageTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/assistants")({
  head: () => ({
    meta: [
      { title: "Connected assistants · Ledgerline" },
      { name: "description", content: "Review AI assistants connected to your Ledgerline account and revoke their access." },
      { property: "og:title", content: "Connected assistants · Ledgerline" },
      { property: "og:description", content: "Review and revoke AI assistant access to your records." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Assistants,
});

type Grant = {
  client: { id?: string; client_id?: string; name?: string; client_name?: string; uri?: string; logo_uri?: string };
  scopes?: string[];
  granted_at?: string;
};

async function authFetch(path: string, method = "GET") {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Please sign in again.");
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1${path}`, {
    method,
    headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.msg || body.message || body.error_description || `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json().catch(() => null);
}

const clientId = (g: Grant) => g.client.client_id ?? g.client.id ?? "";

function Assistants() {
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await authFetch("/user/oauth/grants");
      setGrants(Array.isArray(data) ? data : data?.grants ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setGrants([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function revoke(g: Grant) {
    const id = clientId(g);
    const name = g.client.name ?? g.client.client_name ?? "this assistant";
    if (!id || !window.confirm(`Remove access for ${name}? It will need your approval to connect again.`)) return;
    setBusy(id);
    try {
      await authFetch(`/user/oauth/grants?client_id=${encodeURIComponent(id)}`, "DELETE");
      toast.success(`${name} can no longer access your records`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove access");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageTitle eyebrow="Settings" title="Connected assistants" sub="AI assistants you approved can read (never change) your own records." />
      <div className="mb-5"><Button asChild variant="outline"><Link to="/settings">Back to settings</Link></Button></div>
      {error && <p role="alert" className="mb-4 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm font-medium">{error}</p>}
      {grants === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</p>
      ) : grants.length === 0 ? (
        <div className="rounded-3xl border bg-card p-6 text-center">
          <Bot className="mx-auto mb-2 h-8 w-8 text-gold" />
          <p className="font-display text-lg font-bold">No assistants connected</p>
          <p className="text-sm text-muted-foreground">When you approve an assistant like ChatGPT or Claude, it will appear here.</p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {grants.map((g) => {
            const id = clientId(g);
            const name = g.client.name ?? g.client.client_name ?? "Unnamed assistant";
            return (
              <li key={id} className="flex flex-wrap items-center gap-3 rounded-3xl border bg-card p-4">
                {g.client.logo_uri ? <img src={g.client.logo_uri} alt="" className="h-10 w-10 rounded-xl" /> : <Bot className="h-10 w-10 rounded-xl bg-secondary p-2" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{name}</p>
                  <p className="text-xs text-muted-foreground">
                    {g.granted_at ? `Approved ${new Date(g.granted_at).toLocaleDateString()}` : "Approved"}
                    {g.scopes?.length ? ` · ${g.scopes.join(", ")}` : ""}
                  </p>
                </div>
                <Button variant="destructive" size="sm" disabled={busy === id} onClick={() => revoke(g)}>
                  {busy === id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}Revoke
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
