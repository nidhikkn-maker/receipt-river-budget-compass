// P0-009 / P0-010 regression (was repro): GST invoices, tax deductions and tax credits are archived, never removed.
// Archived lines stay in every GST draft and in the tax working, checked with the app's own GST and tax functions.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { annualSummary, gstr1, gstr3b } from "@/lib/books/gst";
import { creditsFor } from "@/lib/books/compliance";
import { individualLiability } from "@/lib/books/tax-full";
import { taxComputation } from "@/lib/books/taxcomp";
import type { GstInvoice, TaxCredit, TaxDeduction } from "@/lib/books/types";
import { bare, confirmInDialog, harness, OWNER, reset } from "./harness";

vi.mock("@/lib/store", async () => ({ useStore: (await import("./harness")).useStoreMock }));
vi.mock("@tanstack/react-router", async () => (await import("./harness")).routerMock);
vi.mock("@/lib/investments/holdings-store", () => ({ loadDemat: async () => [] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => { const q: Record<string, unknown> = { then: (done: (x: unknown) => unknown) => Promise.resolve(done({ data: [], error: null })) }; for (const n of ["select", "in", "order", "limit", "eq", "maybeSingle"]) q[n] = () => q; return q; } } }));
vi.mock("@/components/books/ItrHandoff", () => ({ ItrHandoff: () => null }));
vi.mock("@/components/books/TaxWorkpaper", () => ({ TaxWorkpaper: () => null }));
import { GstReturns, TaxComputationCard } from "@/components/books/TaxCentre";

const GSTIN = "33AAACT1234F1Z5";
const month = new Date().toISOString().slice(0, 7);
const sale = { id: "inv-1", gstin: GSTIN, kind: "sales", number: "TH/26/041", date: `${month}-02`, party: "Sundaram Traders", partyGstin: "33AABCS1429B1ZB", taxable: 100000, igst: 0, cgst: 9000, sgst: 9000, cess: 0 };
const fy = (() => { const d = new Date(); const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-${String((y + 1) % 100).padStart(2, "0")}`; })();
const ded = { id: "d-1", entityId: "personal", fy, section: "80C", amount: 150000, evidence: "LIC premium receipt" };
const credit = { id: "t-1", entityId: "personal", fy, kind: "tds", amount: 42000, source: "Form 16 from employer" };
beforeEach(() => reset({ entities: [{ id: "ent-1", name: "Thapal Ventures Pvt Ltd", kind: "company", pan: "AAACT1234F", gstins: [GSTIN], booksFrom: "2024-25" }], books: { gstInvoices: [sale], taxDeductions: [ded], taxCredits: [credit] } }));
afterEach(cleanup);
const books = () => harness.stored["books"] as Record<string, unknown[]>;
const gstFigures = () => { const inv = books()["gstInvoices"] as GstInvoice[]; return { r1: gstr1(inv, GSTIN, month), r3: gstr3b(inv, GSTIN, month, new Set()), year: annualSummary(inv, GSTIN, Number(fy.slice(0, 4))) }; };
const taxFigures = () => {
  const c = taxComputation(fy, [], [], [], [], []);
  const cr = creditsFor(books()["taxCredits"] as TaxCredit[], "personal", fy);
  const lines = (books()["taxDeductions"] as TaxDeduction[]).filter((d) => d.entityId === "personal" && d.fy === fy);
  return { credits: cr.total, old: individualLiability(c, fy, "old", lines, cr.total).total, deductions: lines.reduce((s, d) => s + d.amount, 0) };
};

describe("P0-009 GST invoices: archive instead of remove", () => {
  it("Archive needs a reason, keeps the invoice byte-identical and in every GST draft; restore works", async () => {
    const before = gstFigures();
    render(<GstReturns fy={fy} />);
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Archive GST invoice TH/26/041" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("use Amend or a credit/debit note");
    expect(await confirmInDialog("Entered twice; original kept", /^Archive GST invoice$/)).toBe("Archive this GST invoice?");
    const inv = books()["gstInvoices"]![0] as Record<string, unknown>;
    expect(bare(inv)).toEqual(sale);
    expect(inv).toMatchObject({ archivedBy: OWNER, archiveReason: "Entered twice; original kept" });
    expect(gstFigures()).toEqual(before);
    expect(screen.getByText(/Archived invoices in .* \(1\) · still in every draft/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restore Sale TH/26/041 · Sundaram Traders" }));
    await confirmInDialog("Archived by mistake", /^Restore GST invoice$/);
    expect(bare(books()["gstInvoices"]![0])).toEqual(sale);
    expect(gstFigures()).toEqual(before);
  });
});

describe("P0-010 tax deductions and credits: archive instead of remove", () => {
  it("archives a deduction and a credit with reasons; the tax working and taxes paid do not change", async () => {
    const before = taxFigures();
    render(<TaxComputationCard fy={fy} />);
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    const paid = screen.getByText(/^Taxes already paid ·/).textContent;
    fireEvent.click(screen.getByRole("button", { name: "Archive deduction 80C LIC premium receipt" }));
    expect(await confirmInDialog("Receipt replaced by the insurer's certificate", /^Archive deduction$/)).toBe("Archive this deduction?");
    fireEvent.click(screen.getByRole("button", { name: "Archive tax credit Form 16 from employer" }));
    expect(await confirmInDialog("Duplicate of the 26AS line", /^Archive tax credit$/)).toBe("Archive this tax credit?");
    expect(bare(books()["taxDeductions"]![0])).toEqual(ded);
    expect(bare(books()["taxCredits"]![0])).toEqual(credit);
    expect(taxFigures()).toEqual(before);
    expect(screen.getByText(/^Taxes already paid ·/).textContent).toBe(paid);
    expect(screen.getByText(/Archived deductions \(1\) · still counted above/)).toBeInTheDocument();
    expect(screen.getByText(/Archived tax credits \(1\) · still counted above/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restore 80C · LIC premium receipt" }));
    await confirmInDialog("Archived by mistake", /^Restore deduction$/);
    expect((books()["taxDeductions"]![0] as { archiveHistory: { action: string }[] }).archiveHistory.map((e) => e.action)).toEqual(["archived", "restored"]);
    expect(taxFigures()).toEqual(before);
  });
});
