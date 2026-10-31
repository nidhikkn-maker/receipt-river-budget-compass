import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, Upload } from "lucide-react";
import { PageTitle, Stat } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BASE_CURRENCY, CURRENCIES, autoMatch, matchScore, money, type Match, type StatementLine } from "@/lib/expenses";
import { StatementEntry } from "@/components/StatementEntry";
import { readStatement } from "@/lib/statement-import";
import { useStore } from "@/lib/store";
import { useServerFn } from "@tanstack/react-start";
import { extractStatement } from "@/lib/statement-extract.functions";

export const Route = createFileRoute("/_authenticated/reconcile")({
  head: () => ({
    meta: [
      { title: "Bank reconciliation — Ledgerline" },
      { name: "description", content: "Upload a bank or card statement and match it to your expenses automatically." },
      { property: "og:title", content: "Bank reconciliation — Ledgerline" },
      { property: "og:description", content: "Upload a bank or card statement and match it to your expenses automatically." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Reconcile,
});

function Reconcile() {
  const { transactions:expenses, accounts, reconcile } = useStore();
  const [statementAccount, setStatementAccount] = useState("all");
  const [lines, setLines] = useState<StatementLine[]>([]);
  const [fileName, setFileName] = useState("");
  const [currency, setCurrency] = useState<string>(BASE_CURRENCY);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const scanStatement = useServerFn(extractStatement);

  const matches: Match[] = useMemo(() => {
    const auto = autoMatch(lines, expenses, currency, 0.4, statementAccount === "all" ? undefined : statementAccount);
    return auto.map((m) => {
      const o = overrides[m.line.ref];
      if (o === undefined) return m;
      return { ...m, expense: o === "none" ? null : expenses.find((e) => e.id === o) ?? null, score: 1 };
    });
  }, [lines, expenses, currency, overrides, statementAccount]);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setReading(true);
    try {
      let parsed: StatementLine[];
      try { parsed = await readStatement(f); }
      catch (e) {
        if (!/\.(pdf|png|jpe?g|webp)$/i.test(f.name) || f.size > 14 * 1024 * 1024) throw e;
        if (!window.confirm("Read this statement using AI? It may contain private banking details. Review all extracted rows before confirming.")) return;
        const mimeType = /\.pdf$/i.test(f.name) ? "application/pdf" : /\.png$/i.test(f.name) ? "image/png" : /\.webp$/i.test(f.name) ? "image/webp" : "image/jpeg";
        const dataUrl = await new Promise<string>((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(f); });
        const result = await scanStatement({ data: { dataUrl, mimeType } });
        if (!result.ok) throw Error(result.error);
        parsed = result.lines;
      }
      setLines(parsed); setFileName(f.name); setOverrides({});
      toast.success(`${parsed.length} statement lines found`);
    } catch (e) { toast.error((e as Error).message); } finally { setReading(false); }
  };

  const matched = matches.filter((m) => m.expense);
  const confirmAll = async () => {
    setBusy(true);
    try {
      const ids=matched.flatMap(m=>m.expense?[m.expense.id]:[]);if(new Set(ids).size!==ids.length)throw Error("Each statement line must match a different transaction");
      for (const m of matched) {
        if (m.expense && !matchScore(m.line, m.expense, currency, statementAccount === "all" ? undefined : statementAccount)) throw Error("A selected transaction doesn't match this account, direction, date or amount");
      }
      for (const m of matched) { if (!m.expense) continue; await reconcile(m.expense.id, `${fileName} · ${m.line.date} · ${m.line.description}`.slice(0, 300)); }
      toast.success(`${matched.length} expenses marked as matched`);
      setLines([]);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const reconciled = expenses.filter((e) => e.reconciledAt);
  const open = expenses.filter((e) => !e.reconciledAt);

  return (
    <>
      <PageTitle eyebrow="Bank" title="Reconcile statements" sub="Upload a CSV, Excel or text PDF from your bank or card. We match each debit to an expense by amount, date and merchant." />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Matched" value={String(reconciled.length)} />
        <Stat label="Not matched yet" value={String(open.length)} hint={money(open.reduce((s, e) => s + e.amount, 0))} />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-3xl border-2 border-dashed border-primary/40 bg-secondary/50 p-5">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
          <Upload className="h-4 w-4" /> {reading ? "Reading statement…" : "Upload statement"}
          <input type="file" disabled={reading} accept=".csv,.xls,.xlsx,.pdf,.png,.jpg,.jpeg,.webp,text/csv,application/vnd.ms-excel,application/pdf" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} aria-label="Statement file" />
        </label>
        <div className="flex items-center gap-2 text-sm">
          <Select value={statementAccount} onValueChange={v => { setStatementAccount(v); setOverrides({}); }}>
            <SelectTrigger className="w-44" aria-label="Statement account"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All accounts</SelectItem>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
          </Select>
          Statement currency
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="w-24" aria-label="Statement currency"><SelectValue /></SelectTrigger>
            <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <p className="w-full text-xs text-muted-foreground">Needs columns for date, description/narration, and debit (or amount). Dates like 01/10/2026 are read as day/month/year.</p>
      </div>

      {lines.length > 0 && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl font-bold">{matched.length} of {lines.length} matched</h2>
            <Button onClick={confirmAll} disabled={busy || matched.length === 0}>Confirm {matched.length} matches</Button>
          </div>
          <ul className="space-y-2">
            {matches.map((m) => (
              <li key={m.line.ref} className="grid gap-2 rounded-2xl border bg-card p-3 sm:grid-cols-[1fr_1.2fr] sm:items-center">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{m.line.description || "—"}</div>
                  <div className="font-mono text-xs text-muted-foreground">{m.line.date} · {m.line.direction==="credit"?"Credit · ":"Debit · "}{money(m.line.amount, currency)}</div>
                </div>
                <div className="flex items-center gap-2">
                  {m.expense && <BadgeCheck className="h-4 w-4 shrink-0 text-success" />}
                  <Select value={m.expense?.id ?? "none"} onValueChange={(v) => setOverrides({ ...overrides, [m.line.ref]: v })}>
                    <SelectTrigger aria-label={`Match for ${m.line.description}`} className="min-w-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No match</SelectItem>
                      {(m.expense ? [m.expense, ...open.filter((e) => e.id !== m.expense?.id)] : open).filter(e => matchScore(m.line,e,currency,statementAccount === "all" ? undefined : statementAccount)>0).slice(0, 50).map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.date} · {e.title} · {money(e.originalAmount, e.currency)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {!m.expense && <StatementEntry line={m.line} currency={currency} />}
              </li>
            ))}
          </ul>
        </>
      )}

      {lines.length === 0 && reconciled.length > 0 && (
        <>
          <h2 className="mb-3 mt-2 font-display text-xl font-bold">Recently matched</h2>
          <ul className="space-y-2">
            {reconciled.slice(0, 10).map((e) => (
              <li key={e.id} className="flex items-center gap-3 rounded-2xl border bg-card p-3 text-sm">
                <BadgeCheck className="h-4 w-4 text-success" />
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{e.title}</div><div className="truncate text-xs text-muted-foreground">{e.statementRef}</div></div>
                <Button variant="ghost" size="sm" onClick={() => reconcile(e.id, null)}>Unmatch</Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
