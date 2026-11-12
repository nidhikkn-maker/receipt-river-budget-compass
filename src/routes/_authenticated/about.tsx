import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, HelpCircle } from "lucide-react";
import { PageTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { todayISO } from "@/lib/use-position";
import { KNOWN_LIMITATIONS, RELEASE_ENV_KEYS, releaseInfo, serviceHealth, type HealthState, type JobState } from "@/lib/release-info";

export const Route = createFileRoute("/_authenticated/about")({
  head: () => ({ meta: [
    { title: "About Thapal — version and service health" },
    { name: "description", content: "Which version of Thapal you are using, how its services look from this device, and what is known not to work yet." },
    { property: "og:title", content: "About Thapal" }, { property: "og:description", content: "Version, environment, service health and known limitations." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: About,
});

const ICON: Record<HealthState, { icon: typeof CheckCircle2; tone: string; label: string }> = {
  ok: { icon: CheckCircle2, tone: "text-success", label: "Working" },
  attention: { icon: AlertTriangle, tone: "text-destructive", label: "Needs attention" },
  unknown: { icon: HelpCircle, tone: "text-muted-foreground", label: "Not checked" },
};

function useJobs() {
  const [v, setV] = useState<{ jobs: JobState[] | null; failed: boolean }>({ jobs: null, failed: false });
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    void Promise.resolve(supabase.from("job_state").select("name,status,last_success,reason").order("name")).then((r) => {
      if (!live) return;
      if (r.error) setV({ jobs: null, failed: true });
      else setV({ jobs: (r.data ?? []).map((j) => ({ name: j.name, status: j.status, lastSuccess: j.last_success, reason: j.reason })), failed: false });
    }).catch(() => { if (live) setV({ jobs: null, failed: true }); });
    return () => { live = false; };
  }, [n]);
  return { ...v, retry: () => setN((x) => x + 1) };
}

function useWorker(): "active" | "none" | "unsupported" {
  const [w, setW] = useState<"active" | "none" | "unsupported">("none");
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) { setW("unsupported"); return; }
    void navigator.serviceWorker.getRegistration().then((r) => setW(r?.active ? "active" : "none")).catch(() => setW("none"));
  }, []);
  return w;
}

function About() {
  const { userId, loadErrors, pendingCount, refresh, online, readFailure } = useStore();
  const jobs = useJobs();
  const worker = useWorker();
  const env = Object.fromEntries(RELEASE_ENV_KEYS.map((k) => [k, (import.meta.env as Record<string, unknown>)[k]]));
  const info = releaseInfo(env, typeof window === "undefined" ? null : window.location.host);
  const health = serviceHealth({ signedIn: !!userId, online, loadErrors, readFailed: !!readFailure, pendingCount, jobs: jobs.jobs, jobsFailed: jobs.failed, worker, today: todayISO() });
  const rows: [string, string][] = [["Version", info.version], ["Environment", info.environment], ["Build", info.build], ["Commit", info.commit], ["Built on", info.builtAt]];
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <p className="text-sm"><Link to="/settings" className="text-primary underline-offset-4 hover:underline">Settings</Link> <span className="text-muted-foreground">/ About</span></p>
      <PageTitle title="About Thapal" sub="Version, service health as this device sees it, and known limitations." />
      <section aria-labelledby="about-version" className="rounded-2xl border bg-card p-4">
        <h2 id="about-version" className="mb-2 font-semibold">This version</h2>
        <dl className="divide-y text-sm">{rows.map(([k, v]) => <div key={k} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2 py-2"><dt className="text-muted-foreground">{k}</dt><dd className="break-words font-mono text-xs sm:text-sm">{v}</dd></div>)}</dl>
        <p className="mt-2 text-xs text-muted-foreground">No keys, tokens or other secrets are shown here.</p>
      </section>
      <section aria-labelledby="about-health" className="rounded-2xl border bg-card p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h2 id="about-health" className="font-semibold">Service health</h2><Button size="sm" variant="outline" onClick={() => { jobs.retry(); void Promise.resolve(refresh()).catch(() => {}); /* shown on the records row (readFailure) */ }}>Check again</Button></div>
        <ul className="divide-y text-sm">{health.map((h) => { const s = ICON[h.state]; const Icon = s.icon; return (
          <li key={h.key} className="flex items-start gap-3 py-2"><Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.tone}`} aria-hidden /><span className="min-w-0 flex-1"><span className="block font-medium">{h.label} <span className={`text-xs font-normal ${s.tone}`}>· {s.label}</span></span><span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">{h.detail}</span></span></li>
        ); })}</ul>
        <p className="mt-2 text-xs text-muted-foreground">Checked from this device just now. This is not a guarantee that every service is working.</p>
      </section>
      <section aria-labelledby="about-limits" className="rounded-2xl border bg-card p-4">
        <h2 id="about-limits" className="mb-2 font-semibold">Known limitations</h2>
        <ul className="space-y-2 text-sm">{KNOWN_LIMITATIONS.map((l) => <li key={l.area}><b>{l.area}.</b> {l.text} <span className="text-xs text-muted-foreground">({l.ref})</span></li>)}</ul>
      </section>
    </div>
  );
}
