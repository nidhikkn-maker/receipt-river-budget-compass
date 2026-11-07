/**
 * Accountant tax workpaper: every taxpayer (you + each company) for one FY — calculation, source entries and
 * assumptions. Read-only; exported as PDF + CSV ZIP and frozen in DocuRepo.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { ENTITY_KINDS, fyRange } from "@/lib/entities";
import { taxComputation } from "@/lib/books/taxcomp";
import { entityLiability, individualLiability } from "@/lib/books/tax-full";
import { creditsFor } from "@/lib/books/compliance";
import { withEntityIncome, type FromEntityLine } from "@/lib/books/from-entities";
import { profileFor } from "@/lib/books/entity-tax-profile";
import { assumptions, computationHeads, provenanceCsv, sourceGroups, workpaperCsv, type WpSection } from "@/lib/books/tax-workpaper";
import { toCsv } from "@/lib/books/itr-handoff";
import { useBooks } from "./useBooks";

const inr = (n: number) => (n < 0 ? "−" : "") + "₹" + Math.abs(Math.round(n)).toLocaleString("en-IN");

export function TaxWorkpaper({ fy, personalLines }: { fy: string; personalLines: FromEntityLine[] }) {
  const { books, preferences } = useBooks();
  const { transactions, accounts, addDocument, documents } = useStore();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const entities = preferences.entities ?? [];

  const sections = useMemo<WpSection[]>(() => {
    const { start, end } = fyRange(fy);
    const inYear = transactions.filter((t) => t.date >= start && t.date <= end && !t.transferCounterpartOf);
    const acct = (id: string | null | undefined) => accounts.find((a) => a.id === id)?.name ?? "";
    const approved = books.rules.filter((r) => r.status === "active").length;
    const companyAccounts = new Set(Object.values(books.entityAccounts ?? {}).flat());
    const out: WpSection[] = [];
    // Personal
    const base = taxComputation(fy, transactions, preferences.assets ?? [], books.leases, [], books.fyRecords, undefined, undefined, { accountIds: companyAccounts }, null, books.rules);
    const c = withEntityIncome(base, personalLines);
    const dl = (books.taxDeductions ?? []).filter((d) => d.entityId === "personal" && d.fy === fy);
    const pl = individualLiability(c, fy, "new", dl, creditsFor(books.taxCredits ?? [], "personal", fy).total);
    out.push({ key: "personal", name: "You (personal)", kind: "personal", heads: computationHeads(c), tax: pl.lines, taxTotal: pl.total, fromCompanies: personalLines,
      sources: sourceGroups(inYear.filter((t) => !(t.accountId && companyAccounts.has(t.accountId))), acct),
      assumptions: assumptions({ fy, regime: "new regime (default for personal working)", ruleCount: approved, kind: "personal", notes: c.notes, liability: pl, flags: personalLines.filter((l) => l.head === "flag").map((l) => `${l.name}: ${l.basis}`) }) });
    // Each company / profile
    for (const e of entities) {
      const ids = new Set(books.entityAccounts?.[e.id] ?? []);
      const ec = taxComputation(fy, transactions, preferences.assets ?? [], books.leases, [], books.fyRecords, e.id, { accountIds: ids }, undefined, null, books.rules);
      const tp = books.taxProfiles.find((p) => p.entityId === e.id);
      const yp = profileFor(books.entityTaxProfiles, e.id, fy);
      const credits = creditsFor(books.taxCredits ?? [], e.id, fy).total;
      const personalKind = e.kind === "individual" || e.kind === "huf";
      const confirmed = !!(tp?.regime && tp.gstScheme);
      const l = !confirmed ? null : personalKind ? individualLiability(ec, fy, (tp!.regime ?? "new") as "new" | "old", (books.taxDeductions ?? []).filter((d) => d.entityId === e.id && d.fy === fy), credits) : entityLiability(ec, e.kind === "company" ? "company" : "firm", tp?.companyOption, credits);
      const flags = [ids.size ? `${ids.size} linked account(s) define what is counted.` : "No accounts linked — nothing is counted for this taxpayer.", ...(!confirmed ? ["Tax profile (regime and GST scheme) not confirmed — no tax figure shown."] : [])];
      out.push({ key: e.id, name: e.name, kind: e.kind, heads: computationHeads(ec), tax: l?.lines ?? null, taxTotal: l?.total ?? null, fromCompanies: [],
        sources: sourceGroups(inYear.filter((t) => t.accountId && ids.has(t.accountId)), acct),
        assumptions: assumptions({ fy, regime: confirmed ? (personalKind ? `${tp!.regime} regime` : e.kind === "company" ? `company option ${tp?.companyOption ?? "not chosen"}` : "firm rate") : null, ruleCount: approved, kind: e.kind, profile: yp, notes: ec.notes, liability: l, flags }) });
    }
    return out;
  }, [fy, transactions, accounts, books, preferences.assets, entities, personalLines]);

  const exportIt = async () => {
    setBusy(true);
    try {
      const csv = workpaperCsv(sections);
      const { strToU8, zipSync } = await import("fflate");
      const files: Record<string, Uint8Array> = { "1_computation.csv": strToU8(toCsv(csv.computation)), "2_source_transactions.csv": strToU8(toCsv(csv.sources)), "3_assumptions.csv": strToU8(toCsv(csv.assumptions)), "4_field_provenance.csv": strToU8(toCsv(provenanceCsv(sections, books.docLinks ?? [], documents))) };
      const { jsPDF } = await import("jspdf");
      const { loadPdfFonts, textU } = await import("@/lib/pdf-unicode");
      await loadPdfFonts().catch(() => undefined);
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      let y = 16; const line = (t: string, x = 14, size = 10, right?: string) => { if (y > 280) { doc.addPage(); y = 16; } doc.setFontSize(size); textU(doc, t, x, y, { maxW: 140 }); if (right) textU(doc, right, 196, y, { align: "right" }); y += size * 0.55; };
      line(`Tax workpaper — FY ${fy}`, 14, 15); line(`Prepared ${new Date().toISOString().slice(0, 10)} from Ledgerline records · working paper, not a return`, 14, 9);
      for (const s of sections) {
        y += 5; line(`${s.name} · ${s.kind === "personal" ? "Individual" : ENTITY_KINDS[s.kind as keyof typeof ENTITY_KINDS]?.label ?? s.kind}`, 14, 13);
        for (const [k, v] of s.heads) if (v) line(k, 16, 9, inr(v));
        for (const f of s.fromCompanies) line(`${f.name} · ${f.basis}`, 16, 8, f.head === "flag" ? "" : inr(f.amount));
        if (s.tax) { line("Tax", 14, 10); for (const [k, v] of s.tax) line(k, 16, 9, inr(v)); } else line("Tax: not shown until the tax profile is confirmed", 16, 9);
        line("Source transactions", 14, 10); for (const g of s.sources) line(`${g.group} (${g.entries.length})`, 16, 9, inr(g.total));
        line("Assumptions", 14, 10); for (const a of s.assumptions) line(`• ${a}`, 16, 8);
      }
      files["0_workpaper.pdf"] = new Uint8Array(doc.output("arraybuffer"));
      const fileName = `Tax-workpaper_FY${fy}_${new Date().toISOString().slice(0, 10)}.zip`;
      const blob = new Blob([zipSync(files)], { type: "application/zip" });
      await addDocument(new File([blob], fileName, { type: "application/zip" }), { title: `Tax workpaper · FY ${fy}`, docType: "other", docDate: new Date().toISOString().slice(0, 10), amount: null, currency: "INR", merchant: null, notes: `${sections.length} taxpayer(s)`, transactionId: null, accountId: null, loanId: null, expiresOn: null, evidenceLocked: true });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = fileName; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
      toast.success("Workpaper prepared and kept in DocuRepo");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-2 rounded-xl border p-3 text-xs">
      <p className="font-semibold">Tax workpaper for your accountant · FY {fy}</p>
      {sections.map((s) => <div key={s.key} className="rounded-md bg-secondary p-2">
        <button type="button" className="flex w-full justify-between gap-2 text-left font-medium" onClick={() => setOpen(open === s.key ? null : s.key)}>
          <span className="min-w-0 break-words">{s.name}</span><span className="shrink-0">{inr(s.heads.find((h) => h[0] === "Total income")?.[1] ?? 0)} · {s.taxTotal != null ? `tax ${inr(s.taxTotal)}` : "tax not shown"}</span>
        </button>
        {open === s.key && <div className="mt-2 space-y-2">
          <div>{s.heads.filter(([, v]) => v).map(([k, v]) => <p key={k} className="flex justify-between gap-2"><span>{k}</span><b>{inr(v)}</b></p>)}</div>
          {s.fromCompanies.length > 0 && <div><p className="font-medium">From your companies</p>{s.fromCompanies.map((l, i) => <p key={i} className="flex justify-between gap-2"><span className="break-words">{l.name} · {l.basis}</span>{l.head !== "flag" && <b className="shrink-0">{inr(l.amount)}</b>}</p>)}</div>}
          {s.tax && <div><p className="font-medium">Tax</p>{s.tax.map(([k, v]) => <p key={k} className="flex justify-between gap-2"><span>{k}</span><b>{inr(v)}</b></p>)}</div>}
          <div><p className="font-medium">Source transactions</p>{s.sources.length ? s.sources.map((g) => <details key={g.group}><summary className="cursor-pointer">{g.group} · {g.entries.length} · {inr(g.total)}</summary>
            {g.entries.slice(0, 200).map((e) => <p key={e.id} className="flex justify-between gap-2 pl-2"><span className="min-w-0 break-words">{e.date} · {e.title}{e.account ? ` · ${e.account}` : ""}</span><span className="shrink-0">{inr(e.amount)}</span></p>)}
            {g.entries.length > 200 && <p className="pl-2 text-muted-foreground">+{g.entries.length - 200} more in the export</p>}</details>) : <p className="text-muted-foreground">No entries in scope.</p>}</div>
          <div><p className="font-medium">Assumptions</p>{s.assumptions.map((a) => <p key={a} className="text-muted-foreground">• {a}</p>)}</div>
        </div>}
      </div>)}
      <Button size="sm" loading={busy} onClick={() => void exportIt()}>Download workpaper (PDF + spreadsheets)</Button>
      <p className="text-[11px] text-muted-foreground">Read-only: figures, source entries and assumptions come from your saved records. Each download is kept unchanged in DocuRepo.</p>
    </div>
  );
}
