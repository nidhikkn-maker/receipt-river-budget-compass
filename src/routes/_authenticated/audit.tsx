import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { PageTitle } from "@/components/AppShell";
import { useStore } from "@/lib/store";
import { auditFindings } from "@/lib/audit-dashboard";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({ meta: [
    { title: "Audit dashboard — Ledgerline" },
    { name: "description", content: "Every open finding across profiles, invoices, assets and financial years in one place." },
    { property: "og:title", content: "Audit dashboard — Ledgerline" },
    { property: "og:description", content: "Every open finding across profiles, invoices, assets and financial years in one place." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Audit,
});

function Audit() {
  const { preferences, transactions, documents } = useStore();
  const findings = useMemo(() => auditFindings(new Date().toISOString().slice(0, 10), preferences.entities ?? [], preferences.assets ?? [], transactions, documents), [preferences, transactions, documents]);
  return (
    <div className="mx-auto max-w-2xl space-y-3 p-4">
      <PageTitle title="Audit dashboard" sub={findings.length ? `${findings.length} things to look at` : "Nothing open right now"} />
      {findings.map((f) => (
        <Link key={f.key} to={f.to} className="flex items-center justify-between gap-2 rounded-2xl border bg-card px-4 py-3 text-sm">
          <span><span className="mr-2 text-xs text-muted-foreground">{f.area}</span>{f.text}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs ${f.severity === "high" ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"}`}>{f.severity === "high" ? "Important" : "Check"}</span>
        </Link>
      ))}
      <p className="text-xs text-muted-foreground">Findings clear by themselves once the records are fixed. Bank and transfer checks stay in Account health.</p>
    </div>
  );
}
