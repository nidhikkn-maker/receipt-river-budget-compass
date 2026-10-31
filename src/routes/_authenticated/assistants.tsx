import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Bot, Copy, ExternalLink, Loader2, ShieldOff } from "lucide-react";
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
  const res = await fetch(`${import.meta.env['VITE_SUPABASE_URL']}/auth/v1${path}`, {
    method,
    headers: { apikey: import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'], Authorization: `Bearer ${token}` },
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
      <section aria-labelledby="chatgpt-setup" className="mb-6 border-y py-5">
        <h2 id="chatgpt-setup" className="mb-3 font-display text-lg font-bold">Connect ChatGPT</h2>
        <p className="mb-3 text-sm text-muted-foreground">Use ChatGPT on the web after this app is published. Preview links cannot be used for this connection.</p>
        <div className="mb-4 flex items-center gap-2 rounded-lg border bg-secondary p-3">
          <code className="min-w-0 flex-1 break-all text-sm font-semibold">https://ledgerline.biz/mcp</code>
          <Button size="icon" variant="outline" aria-label="Copy MCP endpoint" title="Copy MCP endpoint" onClick={async () => {
            try { await navigator.clipboard.writeText("https://ledgerline.biz/mcp"); toast.success("MCP endpoint copied"); }
            catch { toast.error("Could not copy. Select the address and copy it manually."); }
          }}><Copy className="h-4 w-4" /></Button>
        </div>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>In ChatGPT, open <strong>Settings → Apps</strong>. If available, turn on <strong>Developer mode</strong> in Advanced settings. A workspace administrator may need to enable it.</li>
          <li>Choose <strong>Create</strong> (workspace administrators: <strong>Workspace settings → Apps → Create</strong>). Name the app <strong>Ledgerline</strong>, enter the address above and select <strong>OAuth</strong>. Use automatic registration if offered; do not paste an account token or API key.</li>
          <li>Sign in to Ledgerline with the account holding your expenses. Review the request and choose <strong>Approve</strong>, then return to ChatGPT and finish creating the app.</li>
          <li>Start a chat, select Ledgerline from the apps menu and ask: <strong>“Show my spending by category for October 2026.”</strong></li>
        </ol>
        <h3 className="mt-4 mb-2 font-display text-base font-bold">Verify the connection</h3>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>In ChatGPT, start a new chat and open the apps menu. <strong>Ledgerline</strong> should appear and show as connected.</li>
          <li>Ask: <strong>“List my five most recent expenses.”</strong> The answer should match the entries on your Expenses page here.</li>
          <li>Come back to this page and reload it. <strong>ChatGPT should appear in the list below</strong> with the date you approved it.</li>
          <li>To confirm revoking works, tap <strong>Revoke</strong> below, then ask the same question in ChatGPT—it should no longer return your records. Reconnect by repeating the steps above.</li>
        </ol>
        <p className="mt-3 text-sm text-muted-foreground">ChatGPT can read your own transactions, spending summaries, balances and upcoming payments—not change them. To disconnect, use <strong>Revoke</strong> below and remove the app in ChatGPT. Information already shared in a chat is not erased by revoking access.</p>
        <p className="mt-3 text-sm text-muted-foreground">If Create or Developer mode is missing, check your ChatGPT plan and workspace permissions. If connection fails, confirm the app is published and the address opens on the published domain.</p>
        <Button asChild variant="link" className="mt-2 h-auto px-0"><a href="https://help.openai.com/en/articles/12584461" target="_blank" rel="noopener noreferrer">OpenAI setup and eligibility guide <ExternalLink className="h-4 w-4" /></a></Button>
      </section>
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
