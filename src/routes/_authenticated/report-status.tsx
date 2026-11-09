import { createFileRoute, Link } from "@tanstack/react-router";
import { PageTitle } from "@/components/AppShell";
import { REQUIRED_REPORTS, reportCounts, type ReportState } from "@/lib/report-status";

const TITLE = "Required reports — Thapal";
const DESC = "Status of each required report with links to its supporting evidence and tests.";
export const Route = createFileRoute("/_authenticated/report-status")({
  head: () => ({ meta: [
    { title: TITLE }, { name: "description", content: DESC },
    { property: "og:title", content: TITLE }, { property: "og:description", content: DESC },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: ReportStatus,
});

const LABEL: Record<ReportState, string> = { done: "Done", partial: "Partly done", blocked: "Blocked" };
const TONE: Record<ReportState, string> = { done: "bg-primary/10 text-primary", partial: "bg-secondary text-secondary-foreground", blocked: "bg-destructive/10 text-destructive" };

function ReportStatus() {
  const c = reportCounts();
  return (
    <div className="space-y-4">
      <PageTitle title="Required reports" sub={`${c.done} of ${c.total} done · ${c.partial} partly done`} />
      <div className="divide-y rounded-xl border">
        {REQUIRED_REPORTS.map((r) => (
          <details key={r.n} className="p-3 text-sm">
            <summary className="flex cursor-pointer items-center justify-between gap-2">
              <span className="min-w-0">{r.n}. {r.title}<span className="block text-xs text-muted-foreground">{r.summary}</span></span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${TONE[r.state]}`}>{LABEL[r.state]}</span>
            </summary>
            <div className="mt-2 space-y-1 text-xs">
              {r.waitingOn && <p><b>Waiting on:</b> {r.waitingOn}</p>}
              {r.page && <p><b>See it in the app:</b> <Link to={r.page.to} className="text-primary underline">{r.page.label}</Link></p>}
              <p><b>Evidence:</b> {r.evidence.join(", ") || "—"}</p>
              <p><b>Tests:</b> {r.tests.length ? r.tests.join(", ") : "Not covered by automated tests"}</p>
            </div>
          </details>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Evidence and test references are checked automatically so this list cannot point to missing files.</p>
    </div>
  );
}
