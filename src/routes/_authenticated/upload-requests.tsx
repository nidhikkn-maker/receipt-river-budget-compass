import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { PageTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getUploadRequests } from "@/lib/accountant.functions";
import type { UploadRequest } from "@/lib/upload-link";

export const Route = createFileRoute("/_authenticated/upload-requests")({
  head: () => ({ meta: [
    { title: "Statement upload requests — Ledgerline" },
    { name: "description", content: "Each month's accountant upload link: whether it was emailed, opened, used, and reminded." },
    { property: "og:title", content: "Statement upload requests — Ledgerline" },
    { property: "og:description", content: "Each month's accountant upload link: whether it was emailed, opened, used, and reminded." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: UploadRequests,
});

const STATE: Record<UploadRequest["state"], string> = { active: "Open", expired: "Expired", revoked: "Turned off", full: "Full" };
const TONE: Record<UploadRequest["state"], string> = {
  active: "bg-primary/10 text-primary",
  expired: "bg-secondary text-muted-foreground",
  revoked: "bg-secondary text-muted-foreground",
  full: "bg-secondary text-muted-foreground",
};
const REMINDER: Record<UploadRequest["reminder"], string> = {
  sent: "Reminder sent",
  due: "Reminder owed",
  "not-needed": "No reminder needed — files arrived",
  waiting: "Reminder not due yet",
  closed: "No reminder",
};

const day = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const when = (d: string) => new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function UploadRequests() {
  const load = useServerFn(getUploadRequests);
  const [rows, setRows] = useState<UploadRequest[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => { void load().then(setRows).catch((e) => setErr(e instanceof Error ? e.message : "Couldn't load")); }, [load]);

  if (err) return <div className="mx-auto max-w-2xl"><PageTitle title="Statement upload requests" /><p className="text-sm text-destructive">{err}</p></div>;
  if (!rows) return <div className="mx-auto max-w-2xl">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="mb-2 h-28 w-full rounded-2xl" />)}</div>;

  const shown = all ? rows : rows.slice(0, 6);
  const waiting = rows.reduce((n, r) => n + r.waiting, 0);

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="Statement upload requests" sub="One request each month: the link your accountant uses to send statements, and what has happened about it." />
      {rows.length === 0 ? (
        <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground">No upload requests yet. Set your accountant up under Settings → Accountant upload link.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            {rows.length} request{rows.length === 1 ? "" : "s"} · {rows.filter((r) => r.state === "active").length} open
            {waiting > 0 ? ` · ${waiting} file${waiting === 1 ? "" : "s"} waiting in Statement Desk` : ""}
          </p>
          <ul className="grid gap-2">
            {shown.map((r) => (
              <li key={r.id} className="rounded-2xl bg-card p-4 shadow-sm">
                <div className="flex items-baseline gap-3">
                  <p className="min-w-0 flex-1 font-medium">{r.month}</p>
                  <span className={"shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium " + TONE[r.state]}>{STATE[r.state]}</span>
                </div>
                <dl className="mt-2 grid gap-1.5 text-sm">
                  <Row label="Link emailed" value={r.emailedAt ? `${day(r.emailedAt)}${r.emailedTo ? ` to ${r.emailedTo}` : ""}` : "Not emailed"} />
                  <Row label="Opened" value={r.openedAt ? `${when(r.openedAt)}${r.opens > 1 ? ` · ${r.opens} times` : ""}` : "Not opened yet"} />
                  <Row label="Files" value={`${r.files} of ${r.maxFiles}${r.names.length ? ` — ${r.names.slice(0, 3).join(", ")}${r.names.length > 3 ? ` +${r.names.length - 3} more` : ""}` : ""}${r.waiting ? ` · ${r.waiting} waiting` : ""}`} />
                  <Row label="Reminder" value={r.reminderAt ? `${when(r.reminderAt)}` : REMINDER[r.reminder]} />
                  <Row label="Confirmation to you" value={r.confirmAt ? `${when(r.confirmAt)}${r.confirmTo ? ` · ${r.confirmTo}` : ""}` : r.files ? "Not sent" : "Nothing to confirm yet"} />
                </dl>
                <p className="mt-2 text-xs text-muted-foreground">
                  Created {day(r.createdOn)} · {r.state === "active" ? `open until ${day(r.expiresAt)}` : r.state === "expired" ? `lapsed ${day(r.expiresAt)}` : "no longer usable"}
                </p>
              </li>
            ))}
          </ul>
          {rows.length > 6 && (
            <Button variant="outline" className="mt-3 w-full" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${rows.length}`}</Button>
          )}
          <p className="mt-4 text-sm">
            <Link to="/settings" hash="accountant" className="text-primary">Manage your accountant and link</Link>
          </p>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}
