import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FinancialInboxNav } from "@/components/FinancialInboxNav";
import { useStore } from "@/lib/store";
import { rowsFromItems, lineId } from "@/lib/statement-crosscheck";
import { parseForexStatement, reconcileWallet, walletBreaks, type ForexWallet } from "@/lib/forex-statement";

export const Route = createFileRoute("/_authenticated/forex-reconcile")({
  head: () => ({
    meta: [
      { title: "Forex card reconciliation · Ledgerline" },
      { name: "description", content: "Read multi-currency forex card statements, post missing spends and check each wallet balance." },
      { property: "og:title", content: "Forex card reconciliation · Ledgerline" },
      { property: "og:description", content: "Each currency wallet checked against its own statement balance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ForexPage,
});

async function readRows(file: File) {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  try {
    const doc = await task.promise; const rows: string[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, 40); n++) {
      const c = await (await doc.getPage(n)).getTextContent();
      rows.push(...rowsFromItems(c.items.flatMap((i) => ("str" in i ? [{ str: i.str, x: i.transform[4] as number, y: i.transform[5] as number }] : []))));
    }
    return rows;
  } finally { await task.destroy(); }
}

/** Merges wallets from several files; identical lines appearing in more than one file are kept once. */
function merge(lists: ForexWallet[][]): ForexWallet[] {
  const out = new Map<string, ForexWallet>();
  for (const w of lists.flat()) {
    const t = out.get(w.currency) ?? { currency: w.currency, printedBalance: null, lines: [] };
    const seen = new Set(t.lines.map((l) => JSON.stringify(l)));
    for (const l of w.lines) if (!seen.has(JSON.stringify(l))) t.lines.push(l);
    t.printedBalance = w.printedBalance ?? t.printedBalance;
    out.set(w.currency, t);
  }
  return [...out.values()].map((w) => ({ ...w, lines: w.lines.sort((a, b) => a.date.localeCompare(b.date)) }));
}

const fmt = (n: number, c: string) => `${c} ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function ForexPage() {
  const { accounts, transactions, save, refresh } = useStore();
  const cards = accounts.filter((a) => !a.archived);
  const [accountId, setAccountId] = useState(() => cards.find((a) => /forex/i.test(a.name))?.id ?? "");
  const [wallets, setWallets] = useState<ForexWallet[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy("Reading statements…"); setError(null);
    try { setWallets(merge(await Promise.all([...files].map(async (f) => parseForexStatement(await readRows(f)))))); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn’t read that statement"); }
    finally { setBusy(null); }
  };

  const records = useMemo(() => transactions.filter((e) => e.accountId === accountId && (e.txnType ?? "expense") === "expense")
    .map((e) => ({ id: e.id, date: e.date, currency: e.currency, originalAmount: e.originalAmount, title: e.title })), [transactions, accountId]);
  const results = wallets.map((w) => ({ w, r: reconcileWallet(w, records), breaks: walletBreaks(w) }));

  const post = async (w: ForexWallet, missing: ReturnType<typeof reconcileWallet>["missing"]) => {
    if (!accountId) { toast.error("Choose the forex card account first."); return; }
    let done = 0;
    try {
      for (const l of missing) {
        setBusy(`Saving ${done + 1} of ${missing.length}…`);
        const id = await lineId(accountId, { date: l.date, amount: l.debit, direction: "debit", balance: l.balance, description: `${w.currency}|${l.description}|${l.merchant}`, source: "forex" });
        const fee = /GST|Fee|Charge/i.test(l.description);
        await save({ title: l.merchant ? `${l.description} · ${l.merchant}` : l.description, merchant: l.merchant || (fee ? "HDFC Bank" : null), category: fee ? "Bank charges" : "Uncategorised", scope: "business", memberId: null,
          amount: l.debit, currency: w.currency, paymentMethod: "forex_card", date: l.date, description: `Statement import · Forex ${w.currency} wallet`, tags: ["statement-import"], txnType: "expense", accountId, toAccountId: null }, { createId: id, noRefresh: true });
        done++;
      }
      await refresh();
      toast.success(`${done} ${w.currency} entries posted`);
    } catch (e) { toast.error(`${done} saved; stopped: ${e instanceof Error ? e.message : "try again"}. Retrying will not duplicate saved entries.`); }
    finally { setBusy(null); }
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Forex card reconciliation</h1>
      <div className="my-4"><FinancialInboxNav active="accounts" /></div>
      <p className="text-sm text-muted-foreground">Each currency wallet is checked on its own, in its own currency. Spends are saved in the wallet currency; the rupee value is worked out when saved.</p>
      <p className="mt-1 text-sm"><Link to="/statements" className="font-medium text-primary underline">Statement Desk</Link> reads many statements at once — including wallet statements — and matches, categorises and posts them with your say-so.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Select value={accountId} onValueChange={setAccountId}><SelectTrigger aria-label="Forex card account"><SelectValue placeholder="Forex card account" /></SelectTrigger><SelectContent>{cards.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select>
        <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-md border px-3 text-sm font-medium">Add forex statements (PDF)<input type="file" accept="application/pdf" multiple className="sr-only" onChange={(e) => void load(e.target.files)} /></label>
      </div>
      {busy && <p role="status" className="mt-3 text-sm">{busy}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      {results.map(({ w, r, breaks }) => (
        <Card key={w.currency} title={`${w.currency} wallet`} className="mt-4">
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div><dt className="text-muted-foreground">Loaded</dt><dd className="font-semibold">{fmt(r.loaded, w.currency)}</dd></div>
            <div><dt className="text-muted-foreground">Statement balance</dt><dd className="font-semibold">{r.closing === null ? "—" : fmt(r.closing, w.currency)}</dd></div>
            <div><dt className="text-muted-foreground">Matched spends</dt><dd className="font-semibold">{r.matched.length}</dd></div>
            <div><dt className="text-muted-foreground">Balance after posting</dt><dd className={"font-semibold " + (r.difference === 0 ? "" : "text-destructive")}>{fmt(r.appBalanceAfterPosting, w.currency)}{r.difference === 0 ? " · matches" : r.difference === null ? "" : ` · off by ${fmt(r.difference, w.currency)}`}</dd></div>
          </dl>
          {!w.lines.length && <p className="mt-2 text-sm text-muted-foreground">No transactions in this wallet for the period.</p>}
          {breaks.length > 0 && <p className="mt-2 text-sm text-destructive">{breaks.length} running-balance break{breaks.length > 1 ? "s" : ""} — a line may not have been read. Check before posting.</p>}
          {r.extra.length > 0 && <div className="mt-3 text-sm"><p className="font-medium text-destructive">Saved on this card but not on the statement ({r.extra.length})</p><ul className="list-disc pl-5">{r.extra.map((x) => <li key={x.id} className="break-words">{x.date} · {x.title} · {fmt(x.originalAmount, x.currency)}</li>)}</ul></div>}
          {r.missing.length > 0 && <div className="mt-3 text-sm"><p className="font-medium">On the statement but not saved ({r.missing.length})</p><ul className="divide-y">{r.missing.map((l, i) => <li key={i} className="flex justify-between gap-2 py-1"><span className="min-w-0 break-words">{l.date} · {l.description}{l.merchant ? ` · ${l.merchant}` : ""}</span><span className="shrink-0">{fmt(l.debit, w.currency)}</span></li>)}</ul>
            <Button className="mt-3 min-h-11 w-full sm:w-auto" disabled={!!busy || breaks.length > 0} onClick={() => void post(w, r.missing)}>Post {r.missing.length} {w.currency} entries</Button></div>}
        </Card>
      ))}
    </div>
  );
}
