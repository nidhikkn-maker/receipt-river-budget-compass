import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const tab = (on: boolean) => cn(
  "inline-flex h-10 shrink-0 snap-start items-center whitespace-nowrap rounded-full border px-4 text-sm font-medium transition active:scale-[0.98]",
  on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-accent",
);

/** Pages that do one job share one tab row, so each job has a single home in the menu. */
export const SECTION_GROUPS = {
  statements: { label: "Statement Desk", tabs: [
    { key: "upload", label: "Upload", to: "/statements", search: {} },
    { key: "accountant", label: "From accountant", to: "/statements", search: { tab: "accountant" } },
    { key: "requests", label: "Monthly requests", to: "/upload-requests", search: {} },
  ] },
  health: { label: "Account health", tabs: [
    { key: "records", label: "Records check", to: "/records-check", search: {} },
    { key: "coverage", label: "Statement coverage", to: "/statement-accounts", search: {} },
    { key: "reconcile", label: "Reconciliation", to: "/account-reconciliation", search: {} },
  ] },
  plan: { label: "Plan", tabs: [
    { key: "plan", label: "Plan & calendar", to: "/plan", search: {} },
    { key: "forecast", label: "10-year prediction", to: "/forecast", search: {} },
    { key: "strategy", label: "What if…", to: "/strategy", search: {} },
  ] },
  reports: { label: "Reports", tabs: [
    { key: "charts", label: "Charts", to: "/reports", search: {} },
    { key: "pdf", label: "PDF reports", to: "/report-centre", search: {} },
  ] },
} as const;

type Groups = typeof SECTION_GROUPS;
export function SectionTabs<G extends keyof Groups>({ group, active }: { group: G; active: Groups[G]["tabs"][number]["key"] }) {
  const g = SECTION_GROUPS[group];
  return <nav aria-label={`${g.label} sections`} className="-mx-4 mb-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
    {g.tabs.map(t => <Link key={t.key} to={t.to} search={t.search as never} className={tab(t.key === active)}>{t.label}</Link>)}
  </nav>;
}
