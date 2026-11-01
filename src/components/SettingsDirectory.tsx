import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, Circle, CircleDashed, Search } from "lucide-react";
import { useStore } from "@/lib/store";
import { SETUP_LABEL, essentialsReady, setupStatus, type SetupState } from "@/lib/setup-status";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SetupAssistant } from "@/components/SetupAssistant";

const ICON: Record<SetupState, typeof Circle> = { ready: CheckCircle2, attention: AlertTriangle, partial: CircleDashed, not_configured: Circle, optional: CircleDashed };
const TONE: Record<SetupState, string> = { ready: "text-success", attention: "text-destructive", partial: "text-gold", not_configured: "text-destructive", optional: "text-muted-foreground" };

type Dest = { label: string; desc: string; to: string; hash?: string };
const GROUPS: { title: string; items: Dest[] }[] = [
  { title: "Financial setup", items: [
    { label: "Accounts", desc: "Bank, cash, cards, wallets, loans and investments", to: "/wealth" },
    { label: "Payment methods", desc: "UPI, debit/credit cards and wallets linked to accounts", to: "/payment-methods" },
    { label: "Recipients & payees", desc: "External people, merchants and businesses", to: "/settings", hash: "payees" },
    { label: "Workspaces", desc: "Personal, family, business and official focus", to: "/settings", hash: "finance" },
    { label: "Organisations", desc: "Organisation directory reused in claims and reports", to: "/settings", hash: "organisations" },
    { label: "Reimbursement profiles", desc: "Organisation roles, approvals and receiving accounts", to: "/reimbursement-settings" },
  ] },
  { title: "Expense configuration", items: [
    { label: "Categories", desc: "Add, rename, move and archive categories", to: "/settings", hash: "finance" },
    { label: "Tags", desc: "Grouped tags for people, purpose and projects", to: "/settings", hash: "finance" },
    { label: "People & family", desc: "Family members and invitations", to: "/family" },
    { label: "Expense entry", desc: "Default currency and entry preferences", to: "/settings", hash: "finance" },
  ] },
  { title: "Financial management", items: [
    { label: "Budgets", desc: "Category and scoped budgets", to: "/budgets" },
    { label: "Commitments", desc: "Recurring bills and plans", to: "/plan" },
    { label: "Reimbursements", desc: "Expense claim submissions", to: "/claim-submission" },
    { label: "Travel", desc: "Trips, bookings and advances", to: "/trips" },
  ] },
  { title: "Application preferences", items: [
    { label: "Reports", desc: "Reports Centre and report history", to: "/report-centre" },
    { label: "Notifications", desc: "Reminders and device alerts", to: "/settings", hash: "notifications" },
    { label: "Appearance", desc: "Theme family and light/dark mode", to: "/settings", hash: "appearance" },
    { label: "AI", desc: "AI switches and document reading privacy", to: "/settings", hash: "finance" },
  ] },
  { title: "Security & data", items: [
    { label: "Security", desc: "Face ID / passkey device unlock", to: "/settings", hash: "security" },
    { label: "Connected services", desc: "AI assistants with read-only access", to: "/assistants" },
    { label: "Backup & restore", desc: "ZIP backup with receipts", to: "/settings", hash: "data" },
    { label: "Export", desc: "CSV and PDF exports", to: "/reports" },
    { label: "Privacy & deletion", desc: "Delete your financial data", to: "/settings", hash: "data" },
  ] },
];

const go = (hash?: string) => { if (hash) setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); };

export function SettingsDirectory() {
  const { accounts, expenses, preferences } = useStore();
  const items = useMemo(() => setupStatus({ accounts, expenses, preferences }), [accounts, expenses, preferences]);
  const [q, setQ] = useState("");
  const ql = q.trim().toLowerCase();
  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter((d) => !ql || `${g.title} ${d.label} ${d.desc}`.toLowerCase().includes(ql)) })).filter((g) => g.items.length);
  const ok = essentialsReady(items);
  const [guide, setGuide] = useState(false);
  const showPrompt = !ok && preferences.setupAssistant !== "done";

  return (
    <div className="mb-6 space-y-5">
      <section aria-labelledby="setup-h" className="rounded-3xl border bg-card p-4">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 id="setup-h" className="font-display text-lg font-bold">Financial setup</h2>
          <span className={cn("text-xs font-semibold", ok ? "text-success" : "text-destructive")}>{ok ? "Ready to record expenses" : "Essentials missing"}</span>
        </div>
        <ul className="divide-y">
          {items.map((i) => { const I = ICON[i.state]; return (
            <li key={i.key}>
              <Link to={i.to} onClick={() => go(i.hash)} className="flex items-center gap-3 py-2.5">
                <I className={cn("h-4 w-4 shrink-0", TONE[i.state])} aria-hidden />
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{i.label} <span className={cn("font-normal", TONE[i.state])}>— {SETUP_LABEL[i.state]}</span></span><span className="block truncate text-xs text-muted-foreground">{i.detail}</span></span>
                {i.state !== "ready" && <span className="hidden text-xs font-semibold text-primary sm:inline">{i.action}</span>}
                <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
              </Link>
            </li>); })}
        </ul>
        <div className="mt-2 flex items-center justify-between gap-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">{showPrompt ? "A short guided setup gets you ready in a few steps." : "Reopen the guided setup any time."}</p>
          <Button size="sm" variant={showPrompt ? "default" : "outline"} onClick={() => setGuide(true)}>{showPrompt ? "Start setup" : "Setup guide"}</Button>
        </div>
        <SetupAssistant open={guide} onOpenChange={setGuide} />
      </section>
      <section aria-label="All settings" className="space-y-3">
        <label className="relative block"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search settings" aria-label="Search settings" className="h-9 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm" />
        </label>
        {groups.map((g) => (
          <div key={g.title}>
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground">{g.title}</h3>
            <ul className="divide-y rounded-2xl border bg-card">
              {g.items.map((d) => (
                <li key={d.label}><Link to={d.to} onClick={() => go(d.hash)} className="flex items-center gap-3 px-3 py-2.5"><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{d.label}</span><span className="block truncate text-xs text-muted-foreground">{d.desc}</span></span><ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden /></Link></li>
              ))}
            </ul>
          </div>
        ))}
        {!groups.length && <p className="text-sm text-muted-foreground">No settings match “{q}”.</p>}
      </section>
    </div>
  );
}
