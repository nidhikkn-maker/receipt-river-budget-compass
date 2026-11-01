import { ProcessingPanel, stagesAt } from "@/components/ProcessingPanel";
import { Spinner } from "@/components/ui/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { filePattern, splitNewLines } from "@/lib/statement-fingerprint";
import { toast } from "sonner";
import { BadgeCheck, Sparkles, Upload } from "lucide-react";
import { PageTitle, Stat } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BASE_CURRENCY, CURRENCIES, autoMatch, matchScore, money, type Match, type StatementLine } from "@/lib/expenses";
import { StatementEntry } from "@/components/StatementEntry";
import { readStatement } from "@/lib/statement-import";
import { draftToInput, planStatementRegistration } from "@/lib/statement-auto";
import { useStore } from "@/lib/store";
import { useServerFn } from "@tanstack/react-start";
import { extractStatement } from "@/lib/statement-extract.functions";

export const Route = createFileRoute("/_authenticated/reconcile")({
  head: () => ({
    meta: [
      { title: "Bank statements — Ledgerline" },
      { name: "description", content: "Upload a bank or card statement and have the expenses worked out and registered automatically." },
      { property: "og:title", content: "Bank statements — Ledgerline" },
      { property: "og:description", content: "Upload a bank or card statement and have the expenses worked out and registered automatically." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Reconcile,
});

function Reconcile() {
  const { transactions: expenses, accounts, preferences, save, reconcile, refresh } = useStore();
  const [statementAccount, setStatementAccount] = useState("all");
  const [lines, setLines] = useState<StatementLine[]>([]);
  const [fileName, setFileName] = useState("");
  const [currency, setCurrency] = useState<string>(BASE_CURRENCY);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [excluded, setExcluded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [readStage, setReadStage] = useState<{ name: string; ai: boolean; at: number } | null>(null);
  const scanStatement = useServerFn(extractStatement);

  const accountFilter = statementAccount === "all" ? undefined : statementAccount;
  const accountKey = statementAccount;
  const [known, setKnown] = useState<Set<string>>(new Set());
  const [upTo, setUpTo] = useState<string | null>(null);
  const [lastBatch, setLastBatch] = useState<string | null>(null);
  const [showImported, setShowImported] = useState(false);

  const loadKnown = useCallback(async (key: string) => {
    const set = new Set<string>(); let top: string | null = null; let batch: string | null = null; let latest = "";
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("statement_line_imports").select("fingerprint,line_date,batch_id,created_at").eq("account_key", key).range(from, from + 999);
      if (error) { toast.error("Couldn't check earlier uploads"); break; }
      for (const r of data) { set.add(r.fingerprint); if (!top || r.line_date > top) top = r.line_date; if (r.created_at > latest) { latest = r.created_at; batch = r.batch_id; } }
      if (data.length < 1000) break;
    }
    setKnown(set); setUpTo(top); setLastBatch(batch);
  }, []);
  useEffect(() => { void loadKnown(accountKey); }, [accountKey, loadKnown]);

  const split = useMemo(() => splitNewLines(lines, accountKey, known, upTo), [lines, accountKey, known, upTo]);
  const freshLines = split.fresh;

  const markSeen = async () => {
    if (!lines.length) return;
    const batch = crypto.randomUUID(); const label = filePattern(fileName);
    const rows = lines.map((l) => ({ account_key: accountKey, fingerprint: split.fingerprints.get(l.ref)!, line_date: l.date, batch_id: batch, file_label: label }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from("statement_line_imports").upsert(rows.slice(i, i + 500), { onConflict: "owner_id,account_key,fingerprint", ignoreDuplicates: true });
      if (error) { toast.error("Couldn't remember this statement — the same lines may show again next time"); return; }
    }
    await loadKnown(accountKey);
  };

  const forgetLast = async () => {
    if (!lastBatch || !window.confirm("Forget the last statement upload for this account? Its lines will show as new next time. Saved entries stay.")) return;
    const { error } = await supabase.from("statement_line_imports").delete().eq("batch_id", lastBatch);
    if (error) toast.error("Couldn't forget that upload"); else { toast.success("Last upload forgotten"); await loadKnown(accountKey); }
  };

  const matches: Match[] = useMemo(() => {
    const auto = autoMatch(freshLines, expenses, currency, 0.4, accountFilter);
    return auto.map((m) => {
      const o = overrides[m.line.ref];
      if (o === undefined) return m;
      return { ...m, expense: o === "none" ? null : expenses.find((e) => e.id === o) ?? null, score: 1 };
    });
  }, [freshLines, expenses, currency, overrides, accountFilter]);

  const plan = useMemo(() => planStatementRegistration(freshLines, matches, {
    transactions: expenses,
    accounts,
    categories: preferences.categories,
    accountId: accountFilter ?? null,
    currency,
  }), [freshLines, matches, expenses, accounts, preferences.categories, accountFilter, currency]);

  const [includeDups, setIncludeDups] = useState<Record<string, boolean>>({});
  const queue = [...plan.register, ...plan.possibleDuplicates.filter((d) => includeDups[d.draft.line.ref]).map((d) => d.draft)].filter((d) => !excluded[d.line.ref]);
  const spendingTotal = queue.filter((d) => d.txnType === "expense").reduce((s, d) => s + d.line.amount, 0);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setReading(true); setReadStage({ name: f.name, ai: false, at: 0 });
    try {
      let parsed: StatementLine[];
      try { parsed = await readStatement(f); }
      catch (e) {
        if (!/\.(pdf|png|jpe?g|webp)$/i.test(f.name) || f.size > 14 * 1024 * 1024) throw e;
        if (!window.confirm("Read this statement using AI? It may contain private banking details. Review all extracted rows before confirming.")) return;
        const mimeType = /\.pdf$/i.test(f.name) ? "application/pdf" : /\.png$/i.test(f.name) ? "image/png" : /\.webp$/i.test(f.name) ? "image/webp" : "image/jpeg";
        const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(f); });
        setReadStage({ name: f.name, ai: true, at: 0 });
        const result = await scanStatement({ data: { dataUrl, mimeType } });
        if (!result.ok) throw Error(result.error);
        parsed = result.lines;
      }
      setReadStage((x) => x && { ...x, at: 1 });
      let key = accountKey;
      if (statementAccount === "all") {
        const { data } = await supabase.from("statement_line_imports").select("account_key").eq("file_label", filePattern(f.name)).neq("account_key", "all").order("created_at", { ascending: false }).limit(1);
        const remembered = data?.[0]?.account_key;
        if (remembered && accounts.some((a) => a.id === remembered)) { key = remembered; setStatementAccount(remembered); toast.info(`Using ${accounts.find((a) => a.id === remembered)?.name} like last time`); }
      }
      void key;
      setLines(parsed); setFileName(f.name); setOverrides({}); setExcluded({}); setShowImported(false); setIncludeDups({});
      toast.success(`${parsed.length} statement lines found`);
    } catch (e) { toast.error((e as Error).message); } finally { setReading(false); setReadStage(null); }
  };

  const matched = matches.filter((m) => m.expense);

  const registerAll = async () => {
    if (!queue.length) return;
    setBusy(true);
    let done = 0;
    const failed: string[] = [];
    try {
      for (const d of queue) {
        const id = crypto.randomUUID();
        try {
          await save(draftToInput(d), { createId: id, noRefresh: true });
          await reconcile(id, `${fileName} · ${d.line.date} · ${d.line.description}`.slice(0, 300), { noRefresh: true });
          done++;
        } catch { failed.push(d.title); }
      }
      await refresh();
      await markSeen();
      if (done) toast.success(`${done} ${done === 1 ? "expense" : "expenses"} registered from ${fileName}`);
      if (failed.length) toast.error(`${failed.length} couldn't be registered — try again`);
      setLines([]); setExcluded({}); setOverrides({}); setIncludeDups({});
    } finally { setBusy(false); }
  };

  const confirmAll = async () => {
    setBusy(true);
    try {
      const ids = matched.flatMap((m) => m.expense ? [m.expense.id] : []);
      if (new Set(ids).size !== ids.length) throw Error("Each statement line must match a different transaction");
      for (const m of matched) {
        if (m.expense && !matchScore(m.line, m.expense, currency, accountFilter)) throw Error("A selected transaction doesn't match this account, direction, date or amount");
      }
      for (const m of matched) { if (!m.expense) continue; await reconcile(m.expense.id, `${fileName} · ${m.line.date} · ${m.line.description}`.slice(0, 300)); }
      await markSeen();
      toast.success(`${matched.length} expenses marked as matched`);
      setLines([]);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const reconciled = expenses.filter((e) => e.reconciledAt);
  const open = expenses.filter((e) => !e.reconciledAt);

  return (
    <>
      <PageTitle eyebrow="Bank" title="Statements" sub="Upload a CSV, Excel or PDF from your bank or card. New expenses are worked out and registered on their own — anything unclear is left for you." />
      <Button asChild className="mb-5"><Link to="/historical-import">Historical import & bulk review</Link></Button>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Matched" value={String(reconciled.length)} />
        <Stat label="Not matched yet" value={String(open.length)} hint={money(open.reduce((s, e) => s + e.amount, 0))} />
      </div>

      {readStage && <ProcessingPanel className="mb-3" title={`Reading ${readStage.name}…`} stages={stagesAt([readStage.ai ? "Extracting transactions with AI" : "Reading transactions", "Matching remembered account"], readStage.at)} />}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-3xl border-2 border-dashed border-primary/40 bg-secondary/50 p-5">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-gold px-4 py-2.5 text-sm font-semibold text-gold-foreground shadow-gold">
          {reading ? <Spinner /> : <Upload className="h-4 w-4" />} {reading ? "Reading statement…" : "Upload statement"}
          <input type="file" disabled={reading} accept=".csv,.xls,.xlsx,.pdf,.png,.jpg,.jpeg,.webp,text/csv,application/vnd.ms-excel,application/pdf" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} aria-label="Statement file" />
        </label>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Select value={statementAccount} onValueChange={(v) => { setStatementAccount(v); setOverrides({}); }}>
            <SelectTrigger className="w-44" aria-label="Statement account"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All accounts</SelectItem>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
          </Select>
          Statement currency
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="w-24" aria-label="Statement currency"><SelectValue /></SelectTrigger>
            <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {upTo && <p className="w-full text-sm"><span className="font-semibold">Statement imported up to {new Date(upTo).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span> for {statementAccount === "all" ? "unassigned uploads" : accounts.find((a) => a.id === statementAccount)?.name}. Just upload the latest statement — lines already brought in are skipped. {lastBatch && <button type="button" className="underline text-muted-foreground" onClick={forgetLast}>Forget last upload</button>}</p>}
        <p className="w-full text-xs text-muted-foreground">Needs columns for date, description/narration, and debit (or amount). Dates like 01/10/2026 are read as day/month/year.</p>
      </div>

      {lines.length > 0 && (
        <>
          <div className="mb-4 rounded-3xl border bg-card p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p><span className="font-semibold">{split.alreadyImported.length} lines already imported</span>{upTo ? ` up to ${upTo}` : ""} · <span className="font-semibold text-gold">{freshLines.length} new</span></p>
              <div className="flex gap-2">
                {split.alreadyImported.length > 0 && <Button variant="ghost" size="sm" onClick={() => setShowImported(!showImported)}>{showImported ? "Hide" : "Show"} already-imported lines</Button>}
                <Button variant="outline" size="sm" disabled={busy} onClick={async () => { await markSeen(); setLines([]); toast.success("Statement remembered — only newer lines will show next time"); }}>Done with this statement</Button>
              </div>
            </div>
            {split.olderUnseen.length > 0 && <p className="mt-2 rounded-xl bg-secondary px-3 py-2 text-xs">{split.olderUnseen.length} older line{split.olderUnseen.length === 1 ? "" : "s"} not seen before (dated before your last import) — included below for a quick look.</p>}
            {showImported && <ul className="mt-2 max-h-60 space-y-1 overflow-auto text-xs text-muted-foreground">{split.alreadyImported.map((l) => <li key={l.ref} className="font-mono">{l.date} · {l.description} · {money(l.amount, currency)}</li>)}</ul>}
          </div>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="New entries" value={String(plan.register.length)} hint={money(plan.register.filter((d) => d.txnType === "expense").reduce((s, d) => s + d.line.amount, 0))} />
            <Stat label="Need a look" value={String(plan.review.length)} />
            <Stat label="Possible duplicates" value={String(plan.possibleDuplicates.length)} />
            <Stat label="Already recorded" value={String(plan.skipped.length)} />
          </div>

          <div className="mb-4 rounded-3xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 font-display text-lg font-bold"><Sparkles className="h-4 w-4 text-gold" /> Register {queue.length} transactions automatically</h2>
                <p className="text-xs text-muted-foreground">Merchant, date, amount, category and payment method come from the statement. {queue.length ? `${money(spendingTotal)} of spending will be added.` : "Nothing left to register."}</p>
              </div>
              <Button onClick={registerAll} disabled={busy || queue.length === 0}>Register {queue.length}</Button>
            </div>
            {statementAccount === "all" && accounts.length > 1 && (
              <p className="mt-2 rounded-xl bg-secondary px-3 py-2 text-xs text-muted-foreground">Pick the statement account above and each entry will also update that account's balance.</p>
            )}
            {plan.register.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {plan.register.slice(0, 8).map((d) => (
                  <li key={d.line.ref} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!excluded[d.line.ref]}
                      onChange={(e) => setExcluded({ ...excluded, [d.line.ref]: !e.target.checked })}
                      aria-label={`Include ${d.title}`}
                      className="h-4 w-4 shrink-0 accent-gold"
                    />
                    <span className="min-w-0 flex-1 truncate">{d.title}</span>
                    <span className={"shrink-0 rounded-full px-2 py-0.5 text-xs " + (d.uncertain ? "bg-gold-soft font-semibold text-gold-strong" : "bg-secondary text-muted-foreground")}>{d.uncertain ? `${d.category} — check` : d.category}</span>
                    <span className="shrink-0 font-mono text-xs">{money(d.line.amount, currency)}</span>
                  </li>
                ))}
                {plan.register.length > 8 && <li className="text-xs text-muted-foreground">+ {plan.register.length - 8} more</li>}
              </ul>
            )}
            {plan.recurringHints.length > 0 && (
              <p className="mt-3 rounded-xl bg-secondary px-3 py-2 text-xs">
                <span className="font-semibold">Looks recurring:</span> {plan.recurringHints.map((h) => `${h.merchant} (${h.count + 1} charges)`).join(", ")} — after registering, add them as planned payments so due dates are tracked. <Link to="/plan" className="font-semibold text-primary underline">Open Plan</Link>
              </p>
            )}
          </div>

          {plan.possibleDuplicates.length > 0 && (
            <div className="mb-4 rounded-3xl border-2 border-gold bg-card p-4">
              <h2 className="font-display text-lg font-bold">Possible duplicates ({plan.possibleDuplicates.length})</h2>
              <p className="mb-2 text-xs text-muted-foreground">These look like records you already have. They are not registered unless you say so.</p>
              <ul className="space-y-2">
                {plan.possibleDuplicates.map((d) => (
                  <li key={d.draft.line.ref} className="rounded-2xl bg-secondary/60 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{d.draft.title}</div>
                        <div className="font-mono text-xs text-muted-foreground">{d.draft.line.date} · {money(d.draft.line.amount, currency)}</div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button size="sm" variant="outline" onClick={() => setIncludeDups({ ...includeDups, [d.draft.line.ref]: true })} disabled={!!includeDups[d.draft.line.ref]}>It's new — register</Button>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Already have: {d.existing.title} · {d.existing.date} · {money(d.existing.amount)}{includeDups[d.draft.line.ref] ? " — will be registered as a new entry" : " — left alone"}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {matched.length > 0 && (
            <div className="mb-4 rounded-3xl border bg-card p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="font-display text-lg font-bold">{matched.length} of {freshLines.length} already in your ledger</h2>
                <Button variant="outline" size="sm" onClick={confirmAll} disabled={busy || matched.length === 0}>Confirm {matched.length} matches</Button>
              </div>
              <ul className="space-y-2">
                {matched.map((m) => (
                  <li key={m.line.ref} className="grid gap-2 rounded-2xl bg-secondary/60 p-3 sm:grid-cols-[1fr_1.2fr] sm:items-center">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{m.line.description || "—"}</div>
                      <div className="font-mono text-xs text-muted-foreground">{m.line.date} · {m.line.direction === "credit" ? "Credit · " : "Debit · "}{money(m.line.amount, currency)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <BadgeCheck className="h-4 w-4 shrink-0 text-success" />
                      <Select value={m.expense?.id ?? "none"} onValueChange={(v) => setOverrides({ ...overrides, [m.line.ref]: v })}>
                        <SelectTrigger aria-label={`Match for ${m.line.description}`} className="min-w-0"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No match</SelectItem>
                          {(m.expense ? [m.expense, ...open.filter((e) => e.id !== m.expense?.id)] : open).filter((e) => matchScore(m.line, e, currency, accountFilter) > 0).slice(0, 50).map((e) => (
                            <SelectItem key={e.id} value={e.id}>{e.date} · {e.title} · {money(e.originalAmount, e.currency)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {plan.review.length > 0 && (
            <div className="mb-4 rounded-3xl border bg-card p-4">
              <h2 className="font-display text-lg font-bold">Needs a look ({plan.review.length})</h2>
              <p className="mb-2 text-xs text-muted-foreground">Transfers, cash withdrawals and unclear credits — tell us where the money went.</p>
              <ul className="space-y-2">
                {plan.review.map((d) => (
                  <li key={d.line.ref} className="rounded-2xl bg-secondary/60 p-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{d.title}</div>
                        <div className="font-mono text-xs text-muted-foreground">{d.line.date} · {money(d.line.amount, currency)} · {d.reason}</div>
                      </div>
                    </div>
                    <StatementEntry line={d.line} currency={currency} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {plan.skipped.length > 0 && (
            <p className="mb-4 text-xs text-muted-foreground">{plan.skipped.length} line{plan.skipped.length === 1 ? "" : "s"} left alone: {plan.skipped.slice(0, 3).map((s) => s.reason).join(" · ")}{plan.skipped.length > 3 ? " · …" : ""}</p>
          )}
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
