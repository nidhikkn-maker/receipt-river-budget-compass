import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, FileSearch, ShieldCheck } from "lucide-react";
import { Card } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/expenses";
import { useStore } from "@/lib/store";
import { crossCheck, parseBalanceStatement, rowsFromItems, statementTotals, type BalanceLine, type CrossRecord, type CrossResult } from "@/lib/statement-crosscheck";

export const Route = createFileRoute("/_authenticated/statement-crosscheck")({
  head: () => ({
    meta: [
      { title: "Statement cross-check · Ledgerline" },
      { name: "description", content: "Read-only check of records saved on one account against another account's statements." },
      { property: "og:title", content: "Statement cross-check · Ledgerline" },
      { property: "og:description", content: "Find records saved on the wrong account without changing anything." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CrossCheckPage,
});

type Parsed = { name: string; lines: BalanceLine[]; opening: number | null; closing: number | null };

async function readPdf(file: File): Promise<Parsed> {
  if (!/\.pdf$/i.test(file.name)) throw Error(`${file.name}: choose a PDF statement`);
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  try {
    const doc = await task.promise;
    const rows: string[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, 80); n++) {
      const c = await (await doc.getPage(n)).getTextContent();
      rows.push(...rowsFromItems(c.items.flatMap((i) => ("str" in i ? [{ str: i.str, x: i.transform[4] as number, y: i.transform[5] as number }] : []))));
    }
    const p = parseBalanceStatement(rows, file.name);
    if (!p.lines.length) throw Error(`${file.name}: no entries found in this layout`);
    return { name: file.name, ...p };
  } finally { await task.destroy(); }
}

const LABEL: Record<CrossResult["result"], string> = { found: "Found on other statement", found_wrong_kind: "Found — wrong kind", not_found: "Not found" };

function CrossCheckPage() {
  const { transactions, accounts } = useStore();
  const money_accounts = accounts.filter((a) => !a.archived);
  const [accountId, setAccountId] = useState(() => money_accounts.find((a) => /movac/i.test(a.name))?.id ?? money_accounts[0]?.id ?? "");
  const [from, setFrom] = useState("2026-04-01");
  const [to, setTo] = useState("2026-09-30");
  const [home, setHome] = useState<Parsed[]>([]);
  const [other, setOther] = useState<Parsed[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<CrossResult["result"] | "all">("all");

  const load = async (files: FileList | null, set: (p: Parsed[]) => void) => {
    if (!files?.length) return;
    setBusy(true); setError(null);
    try { set(await Promise.all([...files].map(readPdf))); } catch (e) { setError(e instanceof Error ? e.message : "Couldn’t read that statement"); } finally { setBusy(false); }
  };

  const records: CrossRecord[] = useMemo(() => transactions
    .filter((e) => e.accountId === accountId && e.date >= from && e.date <= to)
    .map((e) => ({ id: e.id, date: e.date, amount: e.amount, kind: e.txnType ?? "expense", name: e.merchant || e.title })), [transactions, accountId, from, to]);

  const out = useMemo(() => (other.length ? crossCheck(records, home.flatMap((p) => p.lines), other.flatMap((p) => p.lines)) : null), [records, home, other]);
  const count = (r: CrossResult["result"]) => out?.results.filter((x) => x.result === r) ?? [];
  const total = (xs: CrossResult[]) => xs.reduce((s, x) => s + x.amount, 0);
  const shown = (out?.results ?? []).filter((r) => filter === "all" || r.result === filter);

  const exportCsv = () => {
    const q = (s: string | number) => `"${String(s).replaceAll('"', '""')}"`;
    const csv = ["record_date,kind,amount,name,result,statement_date,statement_direction,statement_file,statement_description",
      ...(out?.results ?? []).map((r) => [r.date, r.kind, r.amount, r.name, LABEL[r.result], r.line?.date ?? "", r.line?.direction ?? "", r.line?.source ?? "", r.line?.description ?? ""].map(q).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "statement-crosscheck.csv"; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold"><FileSearch className="size-5" /> Statement cross-check</h1>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><ShieldCheck className="size-4" /> Read-only. Statements are read on this device and are not saved, posted or attached. No records change.</p>
      </header>

      <Card className="grid gap-3 p-4 sm:grid-cols-3">
        <label className="space-y-1 text-sm sm:col-span-1">Records saved on
          <select className="h-11 w-full rounded-md border border-input bg-background px-2" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {money_accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm">From<input type="date" className="h-11 w-full rounded-md border border-input bg-background px-2" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="space-y-1 text-sm">To<input type="date" className="h-11 w-full rounded-md border border-input bg-background px-2" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="space-y-1 text-sm sm:col-span-3 sm:grid sm:grid-cols-2 sm:gap-3">
          <span className="block">1. This account’s own statement (optional — records on it are set aside)
            <input aria-label="Own account statement" type="file" accept=".pdf" multiple className="mt-1 block w-full text-sm" onChange={(e) => void load(e.target.files, setHome)} /></span>
          <span className="block">2. Other account statements to search (e.g. IDFC Krupa April–September)
            <input aria-label="Other account statements" type="file" accept=".pdf" multiple className="mt-1 block w-full text-sm" onChange={(e) => void load(e.target.files, setOther)} /></span>
        </label>
        {busy && <p className="text-sm text-muted-foreground sm:col-span-3" role="status">Reading statements…</p>}
        {error && <p className="text-sm text-destructive sm:col-span-3" role="alert">{error}</p>}
        {[...home, ...other].map((p) => { const t = statementTotals(p.lines); const ok = p.opening !== null && p.closing !== null && Math.abs(p.opening - t.debits + t.credits - p.closing) < 0.02; return (
          <p key={p.name} className="text-xs text-muted-foreground sm:col-span-3">{p.name}: {t.count} entries · out {money(t.debits)} · in {money(t.credits)} · closing {p.closing !== null ? money(p.closing) : "—"} · {ok ? "balances add up" : "balances don’t add up — check this file"}</p>
        ); })}
      </Card>

      <p className="text-sm text-muted-foreground">{records.length} records in this period{out ? ` · ${out.onHome} found on the account’s own statement · ${out.results.length} checked against other statements` : " · add other statements to start"}</p>

      {out && (
        <>
          <div className="grid gap-2 sm:grid-cols-4">
            {(["all", "found", "found_wrong_kind", "not_found"] as const).map((k) => { const xs = k === "all" ? out.results : count(k); return (
              <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k} className={`min-h-11 rounded-lg border p-3 text-left ${filter === k ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
                <div className="text-xs text-muted-foreground">{k === "all" ? "All checked" : LABEL[k]}</div>
                <div className="font-semibold">{xs.length} · {money(total(xs))}</div>
              </button>
            ); })}
          </div>
          <div className="flex justify-end"><Button variant="outline" onClick={exportCsv}><Download className="size-4" /> Export CSV</Button></div>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {shown.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><div className="truncate font-medium">{r.name}</div><div className="text-xs text-muted-foreground">{r.date} · saved as {r.kind}{r.line ? ` · statement ${r.line.date}, money ${r.line.direction === "debit" ? "out" : "in"} · ${r.line.source}` : ""}</div></div>
                <div className="flex shrink-0 items-center gap-3"><span className="tabular-nums">{money(r.amount)}</span><span className={`rounded-full px-2 py-0.5 text-xs ${r.result === "found" ? "bg-primary/10 text-primary" : r.result === "found_wrong_kind" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>{LABEL[r.result]}</span></div>
              </li>
            ))}
            {!shown.length && <li className="p-3 text-sm text-muted-foreground">Nothing in this group.</li>}
          </ul>
        </>
      )}
    </div>
  );
}
