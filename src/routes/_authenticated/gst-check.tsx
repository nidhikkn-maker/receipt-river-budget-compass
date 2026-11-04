import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageTitle } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { missingInvoices, supplierSummary } from "@/lib/gst-recon";
import { matchGstr2b, parseGstr2b, type G2bInvoice } from "@/lib/gstr2b";

export const Route = createFileRoute("/_authenticated/gst-check")({
  head: () => ({ meta: [
    { title: "Suppliers & missing invoices — Ledgerline" },
    { name: "description", content: "Business suppliers with GST captured, GSTIN on file and business spends that still need an invoice." },
    { property: "og:title", content: "Suppliers & missing invoices — Ledgerline" },
    { property: "og:description", content: "Business suppliers with GST captured, GSTIN on file and business spends that still need an invoice." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: GstCheck,
});

const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

function GstCheck() {
  const { transactions, documents } = useStore();
  const [min, setMin] = useState(500);
  const missing = useMemo(() => missingInvoices(transactions, documents, min), [transactions, documents, min]);
  const [g2b, setG2b] = useState<G2bInvoice[] | null>(null);
  const [g2bErr, setG2bErr] = useState("");
  const g2bResult = useMemo(() => (g2b ? matchGstr2b(g2b, transactions) : null), [g2b, transactions]);
  const readG2b = async (f: File | undefined) => {
    if (!f) return; setG2bErr("");
    try { const inv = parseGstr2b(JSON.parse(await f.text())); if (!inv.length) throw new Error(); setG2b(inv); }
    catch { setG2b(null); setG2bErr("This doesn't look like a GSTR-2B JSON file from the GST portal."); }
  };
  const suppliers = useMemo(() => supplierSummary(transactions, documents), [transactions, documents]);

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4">
      <PageTitle title="Suppliers & invoices" sub="Business spending only. This page only reports — nothing is changed." />

      <section className="space-y-2 rounded-2xl border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold">Missing invoices ({missing.length})</p>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">from ₹
            <Input type="number" className="h-8 w-24" value={min} onChange={(e) => setMin(Math.max(0, Number(e.target.value) || 0))} />
          </label>
        </div>
        {missing.length === 0 && <p className="text-sm text-muted-foreground">Every business spend in this range has a bill or document.</p>}
        {missing.slice(0, 50).map((e) => (
          <Link key={e.id} to="/expenses" className="flex justify-between rounded-xl bg-secondary/50 px-3 py-2 text-sm">
            <span>{e.merchant || e.title} · {e.date}</span><b>{inr(e.amount)}</b>
          </Link>
        ))}
      </section>

      <section className="space-y-2 rounded-2xl border bg-card p-4">
        <p className="font-semibold">Supplier GST filings (GSTR-2B)</p>
        <p className="text-xs text-muted-foreground">Download the GSTR-2B JSON from the GST portal and choose it here. It is read on this device only and not saved.</p>
        <input type="file" accept=".json,application/json" aria-label="GSTR-2B file" onChange={(e) => void readG2b(e.target.files?.[0])} className="text-sm" />
        {g2bErr && <p className="text-sm text-destructive">{g2bErr}</p>}
        {g2bResult && (<>
          <p className="text-sm">{g2bResult.rows.filter((r) => r.state === "matched").length} matched · {g2bResult.rows.filter((r) => r.state === "amount-differs").length} amount differs · {g2bResult.rows.filter((r) => r.state === "not-in-books").length} not in your books · {g2bResult.booksOnly.length} taxed bills the supplier hasn't filed</p>
          {g2bResult.rows.filter((r) => r.state !== "matched").slice(0, 50).map((r) => (
            <div key={r.invoice.gstin + r.invoice.number} className="flex justify-between rounded-xl bg-secondary/50 px-3 py-2 text-sm">
              <span>{r.invoice.supplier} · #{r.invoice.number} · {r.invoice.date}</span>
              <span className={r.state === "not-in-books" ? "text-destructive" : ""}>{inr(r.invoice.value)} · {r.state === "not-in-books" ? "not in books" : "amount differs"}</span>
            </div>
          ))}
          {g2bResult.booksOnly.slice(0, 30).map((e) => (
            <div key={e.id} className="flex justify-between rounded-xl bg-secondary/50 px-3 py-2 text-sm"><span>{e.merchant || e.title} · {e.date}</span><span>{inr(e.amount)} · supplier hasn't filed</span></div>
          ))}
        </>)}
      </section>

      <section className="space-y-2 rounded-2xl border bg-card p-4">
        <p className="font-semibold">Suppliers ({suppliers.length})</p>
        {suppliers.length === 0 && <p className="text-sm text-muted-foreground">No business spending yet.</p>}
        {suppliers.map((s) => (
          <div key={s.key} className="rounded-xl bg-secondary/50 px-3 py-2 text-sm">
            <div className="flex justify-between"><span className="font-semibold">{s.name}</span><b>{inr(s.total)}</b></div>
            <p className="text-xs text-muted-foreground">{s.count} bills · {s.withBill} with invoice · GST on bills {inr(s.tax)} · {s.gstin ? `GSTIN ${s.gstin}` : "GSTIN not on file"}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
