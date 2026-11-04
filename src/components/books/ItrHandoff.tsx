/**
 * Accountant-ready income-tax handoff [v6 §46]: one ZIP with the computation (PDF + spreadsheet), schedules,
 * source list, originals, assumptions and the "still needed" checklist. Each version is frozen in DocuRepo.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { fyRange, type EntityProfile } from "@/lib/entities";
import type { Expense } from "@/lib/expenses";
import type { GainLine } from "@/lib/investments/demat";
import type { TaxComputation } from "@/lib/books/taxcomp";
import { gainTerm } from "@/lib/books/taxcomp";
import { CREDIT_LABEL } from "@/lib/books/compliance";
import { computationRows, HANDOFF_STATUS_LABEL, handoffGaps, toCsv, type HandoffGap, type HandoffRecord, type HandoffStatus } from "@/lib/books/itr-handoff";
import type { TaxCredit } from "@/lib/books/types";
import { useBooks } from "./useBooks";

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const TAX_DOC_TYPES = new Set(["tax_statement", "tax_return", "capital_gains_statement", "transaction_statement", "audited_financials", "trial_balance", "depreciation_schedule", "lease_agreement", "loan_statement", "loan_agreement", "property_deed", "insurance", "mutual_fund_statement", "demat_statement"]);

export function ItrHandoff(p: { fy: string; ent: EntityProfile | undefined; c: TaxComputation; personal: boolean; regime: "new" | "old" | undefined; profileConfirmed: boolean; credits: TaxCredit[]; unrecordedTaxDebits: number; gains: GainLine[]; scope: Set<string> | null; slabTax: number | null }) {
  const { books, save } = useBooks();
  const { documents, transactions, accounts, addDocument, signedUrl, updateDocument } = useStore();
  const [busy, setBusy] = useState(false);
  const [ack, setAck] = useState("");
  const entityId = p.ent?.id ?? "personal";
  const name = p.ent?.name ?? "You (personal)";
  const gaps: HandoffGap[] = handoffGaps({ fy: p.fy, c: p.c, personal: p.personal, regime: p.regime, profileConfirmed: p.ent ? p.profileConfirmed : !!p.regime, salaryEvidence: (books.salaryEvidence ?? []).some((x) => x.entityId === entityId && x.fy === p.fy), credits: p.credits, unrecordedTaxDebits: p.unrecordedTaxDebits, docs: documents, records: books.fyRecords.filter((r) => (p.ent ? r.entityId === p.ent.id : !r.entityId)), gainsMissingCost: p.gains.filter((g) => g.gain == null || !g.buyDate).length, rules: books.rules, entityName: name, companyKind: !p.personal });
  const history = (books.itrHandoffs ?? []).filter((h) => h.entityId === entityId && h.fy === p.fy).sort((a, b) => b.version - a.version);
  const latest = history[0];

  const build = async () => {
    setBusy(true);
    try {
      const { start, end } = fyRange(p.fy);
      const entries = transactions.filter((t: Expense) => t.date >= start && t.date <= end && !t.transferCounterpartOf && (!p.scope || (!!t.accountId && p.scope.has(t.accountId))));
      const acct = (id: string | null | undefined) => accounts.find((a) => a.id === id)?.name ?? "";
      const rows = computationRows(p.c);
      const files: Record<string, Uint8Array> = {};
      const { strToU8, zipSync } = await import("fflate");
      const put = (n: string, s: string) => { files[n] = strToU8(s); };
      put("1_computation.csv", toCsv([["Head", "Amount (INR)"], ...rows, ...(p.slabTax != null ? [["Indicative slab tax (new regime, before special-rate gains)", p.slabTax]] : []), ["Taxes already paid", p.credits.reduce((s, x) => s + x.amount, 0)]]));
      put("2_tax_credits.csv", toCsv([["Type", "Amount", "Source", "Document", "Bank entry"], ...p.credits.map((x) => [CREDIT_LABEL[x.kind], x.amount, x.source, documents.find((d) => d.id === x.docId)?.title ?? "", x.transactionId ?? ""])]));
      put("3_capital_gains.csv", toCsv([["Security", "ISIN", "Bought", "Sold", "Quantity", "Cost", "Proceeds", "Gain", "Term"], ...p.gains.filter((g) => g.sellDate >= start && g.sellDate <= end).map((g) => [g.name, g.isin, g.buyDate ?? "missing", g.sellDate, g.quantity, g.cost ?? "missing", g.proceeds ?? "", g.gain ?? "missing", g.buyDate ? gainTerm("listed_equity", g.buyDate, g.sellDate) : "unknown"])]));
      put("4_losses.csv", toCsv([["From FY", "Kind", "Amount", "Evidence"], ...books.fyRecords.filter((r) => (p.ent ? r.entityId === p.ent.id : !r.entityId)).flatMap((r) => r.lossesCarriedForward.map((l) => [l.fromFy, l.kind, l.amount, r.filedReturns.length ? `Filed ${r.filedReturns[0]!.form} ack ${r.filedReturns[0]!.ack}` : "no filed return recorded"]))]));
      put("5_sources.csv", toCsv([["Date", "Type", "Title", "Merchant", "Category", "Amount (INR)", "Account", "Documents", "Entry id"], ...entries.map((t) => [t.date, t.txnType ?? "expense", t.title, t.merchant ?? "", t.category, t.amount, acct(t.accountId), [...(t.receipts ?? []).map((r) => r.name), ...documents.filter((d) => d.transactionId === t.id).map((d) => d.title)].join("; "), t.id])]));
      put("6_still_needed.csv", toCsv([["What", "Kind", "Why"], ...gaps.map((g) => [g.need, g.kind, g.why])]));
      const notes = [...p.c.notes, p.ent ? "" : "Personal working excludes accounts and assets linked to companies.", "Figures use only approved rules; this is a working paper, not a return. Ledgerline never files."].filter(Boolean);
      put("README.txt", [`Income-tax working papers — ${name} — FY ${p.fy}`, `Prepared ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC from Ledgerline records.`, "", "Assumptions:", ...notes.map((n) => `- ${n}`), "", `Still needed (${gaps.length}):`, ...gaps.map((g) => `- ${g.need} — ${g.why}`)].join("\r\n"));
      // PDF summary.
      const { jsPDF } = await import("jspdf");
      const { loadPdfFonts, textU } = await import("@/lib/pdf-unicode");
      await loadPdfFonts().catch(() => undefined);
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      let y = 16; const line = (t: string, x = 14, size = 10, right?: string) => { if (y > 280) { doc.addPage(); y = 16; } doc.setFontSize(size); textU(doc, t, x, y, { maxW: 140 }); if (right) textU(doc, right, 196, y, { align: "right" }); y += size * 0.55; };
      line(`Income-tax working — ${name}`, 14, 15); line(`FY ${p.fy} · prepared ${new Date().toISOString().slice(0, 10)} · working paper, not a return`, 14, 9); y += 3;
      for (const [k, v] of rows) line(k, 14, 10, inr(v));
      if (p.slabTax != null) line("Indicative slab tax (new regime)", 14, 10, inr(p.slabTax));
      line("Taxes already paid", 14, 10, inr(p.credits.reduce((s, x) => s + x.amount, 0)));
      y += 4; line(`Still needed (${gaps.length})`, 14, 12);
      for (const g of gaps) { line(`• ${g.need}`, 14, 10); line(g.why, 18, 8); }
      y += 4; line("Assumptions", 14, 12); for (const n of notes) line(`• ${n}`, 14, 8);
      files["0_computation.pdf"] = new Uint8Array(doc.output("arraybuffer"));
      // Originals for the year (tax-relevant types), capped to keep the file shareable.
      const originals = documents.filter((d) => TAX_DOC_TYPES.has(d.docType) && (d.docDate ?? d.createdAt.slice(0, 10)) >= start && (d.docDate ?? d.createdAt.slice(0, 10)) <= `${Number(p.fy.slice(0, 4)) + 2}-03-31`).slice(0, 40);
      for (const d of originals) {
        const url = await signedUrl(d.filePath); if (!url) continue;
        const r = await fetch(url).catch(() => null); if (!r?.ok) continue;
        files[`originals/${d.id.slice(0, 8)}-${d.fileName.replace(/[^\w.\- ]+/g, "_")}`] = new Uint8Array(await r.arrayBuffer());
      }
      const version = (latest?.version ?? 0) + 1;
      const fileName = `ITR-handoff_${name.replace(/[^\w]+/g, "-")}_FY${p.fy}_v${version}.zip`;
      const blob = new Blob([zipSync(files)], { type: "application/zip" });
      const file = new File([blob], fileName, { type: "application/zip" });
      // Freeze this version in DocuRepo so later edits never change what was handed over.
      const docId = await addDocument(file, { title: `ITR handoff · ${name} · FY ${p.fy} · v${version}`, docType: "other", docDate: new Date().toISOString().slice(0, 10), amount: null, currency: "INR", merchant: null, notes: `${gaps.length} item(s) still needed`, transactionId: null, accountId: null, loanId: null, expiresOn: null, evidenceLocked: true });
      const rec: HandoffRecord = { id: crypto.randomUUID(), entityId, fy: p.fy, version, createdAt: new Date().toISOString(), docId, status: "prepared", totalIncome: p.c.total, open: gaps.length };
      await save({ itrHandoffs: [...(books.itrHandoffs ?? []), rec] });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = fileName; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
      toast.success(`Handoff v${version} prepared and kept in DocuRepo`);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const setStatus = (h: HandoffRecord, status: HandoffStatus, extra: Partial<HandoffRecord> = {}) => save({ itrHandoffs: (books.itrHandoffs ?? []).map((x) => (x.id === h.id ? { ...x, status, ...extra } : x)) });
  const download = async (h: HandoffRecord) => { const d = documents.find((x) => x.id === h.docId); const url = d ? await signedUrl(d.filePath) : null; if (!url) { toast.error("Couldn't open the saved handoff"); return; } const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.click(); };

  return (
    <div className="space-y-2 rounded-xl border p-3 text-xs">
      <p className="font-semibold">Accountant handoff · {name} · FY {p.fy}</p>
      {gaps.length ? <div className="space-y-1"><p className="font-medium">Still needed ({gaps.length})</p>{gaps.map((g) => <div key={g.key} className="rounded-md bg-secondary p-2"><p className="break-words font-medium">{g.need}</p><p className="break-words text-muted-foreground">{g.why}</p>
        {g.kind === "document" && <Link to="/statements" search={{ context: "tax" }} className="text-primary underline">Add it in Statement Desk</Link>}</div>)}</div>
        : <p className="text-primary">Nothing else is needed from your records for this working.</p>}
      <Button size="sm" loading={busy} onClick={() => void build()}>Prepare handoff for accountant</Button>
      <p className="text-[11px] text-muted-foreground">Downloads one ZIP: computation (PDF and spreadsheet), credits, capital gains, losses, every source entry, originals for the year, assumptions and this checklist. Each version is kept unchanged in DocuRepo.</p>
      {history.map((h) => <div key={h.id} className="flex flex-wrap items-center justify-between gap-1 border-t pt-1">
        <span className="min-w-0 break-words">v{h.version} · {h.createdAt.slice(0, 10)} · {HANDOFF_STATUS_LABEL[h.status]}{h.ack ? ` · ack ${h.ack}` : ""} · {h.open} open</span>
        <span className="flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" className="h-7" onClick={() => void download(h)}>Open</Button>
          {h.status === "prepared" && <Button size="sm" variant="ghost" className="h-7" onClick={() => setStatus(h, "sent")}>Mark sent</Button>}
          {h.status === "sent" && <Button size="sm" variant="ghost" className="h-7" onClick={() => setStatus(h, "questions")}>Has questions</Button>}
          {h.status !== "filed" && h === latest && <><Input aria-label="Acknowledgement number" className="h-7 w-32" placeholder="Ack no. when filed" value={ack} onChange={(e) => setAck(e.target.value)} />
            <Button size="sm" variant="outline" className="h-7" disabled={ack.trim().length < 6} onClick={async () => { await setStatus(h, "filed", { ack: ack.trim() }); const d = documents.find((x) => x.id === h.docId); if (d) await updateDocument(d.id, { notes: `Filed · ack ${ack.trim()}` }).catch(() => undefined); setAck(""); toast.success("Recorded as filed"); }}>Mark filed</Button></>}
        </span></div>)}
    </div>
  );
}
