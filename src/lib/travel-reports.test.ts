import { describe, expect, it } from "vitest";
import { travelEntries, travelReport } from "./travel-reports";
import { bookingMatches, bookingOutstanding, bookingPaid, tripBudgetDetail, tripFinance, type Booking, type TravelTrip } from "./travel";

const trip = (over: Partial<TravelTrip> = {}): TravelTrip => ({ id: "t1", name: "Goa", destination: "Goa", start: "2026-12-01", end: "2026-12-05", budget: 50000, currencies: ["INR"], ...over });
const opts = { memberName: (id: string | null) => (id === "m1" ? "Asha" : "Me"), accountName: (id: string | null) => (id === "acc1" ? "Amex" : "Unassigned") };
const hotel = { id: "e1", date: "2026-12-02", amount: 60000, originalAmount: 60000, currency: "INR", fxRate: 1, category: "Hotels", merchant: "Taj", title: "Hotel stay", tags: ["Trip: Goa"], scope: "business", accountId: "acc1", reimbursementStatus: "pending", department: "MOVAC", splits: [{ memberId: null, amount: 36000 }, { memberId: "m1", amount: 24000 }] };
const rows = (r: ReturnType<typeof travelReport>) => r.rows[r.rows.length - 1]!;

describe("travel reports reconcile with the ledger", () => {
  it("counts every cut to the same trip total", () => {
    for (const cut of ["workspace", "organisation", "traveller", "destination", "category", "account"] as const) {
      expect(travelReport(cut, [trip()], [hotel] as never, opts), cut).toMatchObject({ rows: expect.arrayContaining([["Total", "60000.00", "100.00"]]) });
    }
    expect(travelReport("month", [trip()], [hotel] as never, opts).rows).toEqual([["2026-12", "60000.00", ""], ["Year 2026", "", "60000.00"], ["Total", "60000.00", ""]]);
  });
  it("lists an entry tagged to two trips once in the total", () => {
    const two = [trip(), trip({ id: "t2", name: "Goa", destination: "North Goa" })];
    expect(travelEntries(two, [hotel] as never)).toHaveLength(1);
    expect(rows(travelReport("trip", two, [hotel] as never, opts))).toEqual(["Total (each entry once)", "", "", "", "60000.00", "0.00", "", "60000.00", ""]);
  });
  it("splits one entry across workspaces without duplicating it", () => {
    const split = { ...hotel, workspaceAllocations: [{ workspace: "business", amount: 36000 }, { workspace: "family", amount: 24000 }] };
    const r = travelReport("workspace", [trip()], [split] as never, opts);
    expect(r.rows).toEqual([["Business", "36000.00", "60.00"], ["Family", "24000.00", "40.00"], ["Total", "60000.00", "100.00"]]);
  });
  it("uses split shares for the traveller cut", () => expect(travelReport("traveller", [trip()], [hotel] as never, opts).rows).toEqual([["Me", "36000.00", "60.00"], ["Asha", "24000.00", "40.00"], ["Total", "60000.00", "100.00"]]));
  it("keeps an unpaid booking a commitment, never spending", () => {
    const withBooking = trip({ bookings: [{ id: "b", kind: "hotel", provider: "Taj", ref: "", date: "2026-12-03", amount: 10000, status: "unpaid" }] });
    const r = travelReport("trip", [withBooking], [hotel] as never, opts);
    expect(r.rows[0]!.slice(4)).toEqual(["60000.00", "10000.00", "50000.00", "70000.00", "-10000.00"]);
    expect(travelReport("category", [withBooking], [hotel] as never, opts).rows.at(-1)).toEqual(["Total", "60000.00", "100.00"]);
  });
  it("adds contingency to the planned column", () => {
    const t = trip({ contingency: 5000, budgetLines: [{ category: "Hotels", amount: 40000 }] });
    expect(travelReport("planned", [t], [hotel] as never, opts).rows.at(-1)).toEqual(["Total", "55000.00", "60000.00", "0.00", "60000.00", "", ""]);
  });
  it("separates pending from reimbursed", () => {
    const r = travelReport("reimbursement", [trip()], [hotel, { ...hotel, id: "e2", reimbursementStatus: "received" }] as never, opts);
    expect(r.rows.slice(-2)).toEqual([["", "Total pending", "", "", "", "", "60000.00"], ["", "Total reimbursed", "", "", "", "60000.00", ""]]);
  });

  it("retains unsplit entries when other traveller entries have split shares", () => {
    const r = travelReport("traveller", [trip()], [hotel, { ...hotel, id: "e2", amount: 10000, splits: [], memberId: "m1" }] as never, opts);
    expect(r.rows).toEqual([["Me", "36000.00", "51.43"], ["Asha", "34000.00", "48.57"], ["Total", "70000.00", "100.00"]]);
  });
  it("counts a multiply-associated entry once in destination rows, not only the footer", () => {
    const r = travelReport("destination", [trip(), trip({ id: "t2", destination: "North Goa" })], [hotel] as never, opts);
    expect(r.rows).toEqual([["Goa", "60000.00", "100.00"], ["Total", "60000.00", "100.00"]]);
  });
  it("reports only the unpaid remainder of a partially paid booking in each commitment cut", () => {
    const t = trip({ bookings: [{ id: "b", kind: "hotel", provider: "Taj", ref: "", date: "2026-12-03", amount: 100000, status: "unpaid", expenseIds: ["e1"] }] });
    expect(travelReport("trip", [t], [hotel] as never, opts).rows[0]?.[5]).toBe("40000.00");
    expect(travelReport("planned", [t], [hotel] as never, opts).rows[0]?.[3]).toBe("40000.00");
  });
  it("uses claim shares and partial receipts for trip and reimbursement totals", () => {
    const e = { ...hotel, reimbursement: { reimbursable: 36000, stage: "partial", receipts: [{ id: "r", date: "2026-12-04", amount: 12000 }] } };
    expect(tripFinance(trip(), [e] as never)).toMatchObject({ reimbursablePending: 24000, reimbursed: 12000 });
    expect(travelReport("reimbursement", [trip()], [e] as never, opts).rows[0]?.slice(4)).toEqual(["36000.00", "12000.00", "24000.00"]);
  });
});

describe("trip budget detail", () => {
  it("compares each category budget with what was recorded", () => {
    const d = tripBudgetDetail(trip({ budgetLines: [{ category: "Hotels", amount: 40000 }, { category: "Flights", amount: 10000 }], contingency: 5000 }), [hotel] as never);
    expect(d.lines).toEqual([{ category: "Hotels", budget: 40000, actual: 60000, left: -20000, over: true }, { category: "Flights", budget: 10000, actual: 0, left: 10000, over: false }]);
    expect({ ...d, lines: undefined }).toEqual({ lines: undefined, budgeted: 50000, contingency: 5000, planned: 55000, spent: 60000, unbudgeted: 0, remaining: -5000, hasPlan: true });
  });
  it("reports spending that no budget line covers", () => {
    const d = tripBudgetDetail(trip({ budgetLines: [{ category: "Flights", amount: 10000 }] }), [hotel] as never);
    expect(d.unbudgeted).toBe(60000);
    expect(d.remaining).toBe(-10000);
  });
});

describe("booking payments", () => {
  const booking = (over: Partial<Booking> = {}): Booking => ({ id: "b", kind: "hotel", provider: "Taj", ref: "", date: "2026-12-03", amount: 30000, status: "unpaid", ...over });
  const paid = { id: "p1", date: "2026-12-01", amount: 12000, originalAmount: 12000, currency: "INR", fxRate: 1, category: "Hotels", merchant: "Taj", title: "Deposit", tags: ["Trip: Goa"] };
  it("reduces the commitment by what is already paid", () => {
    const b = booking({ expenseIds: ["p1"] });
    expect(bookingPaid(b, [paid] as never)).toBe(12000);
    expect(bookingOutstanding(b, [paid] as never)).toBe(18000);
  });
  it("treats several partial payments as one settlement", () => {
    const b = booking({ expenseIds: ["p1", "p2"] });
    expect(bookingOutstanding(b, [paid, { ...paid, id: "p2", amount: 18000 }] as never)).toBe(0);
  });
  it("leaves cancelled bookings owing nothing", () => expect(bookingOutstanding(booking({ status: "cancelled", expenseIds: ["p1"] }), [paid] as never)).toBe(0));
  it("never suggests a payment already linked through the partial-payment list", () => {
    const t = trip({ bookings: [booking({ expenseIds: ["p1"] }), booking({ id: "b2", amount: 12000 })] });
    expect(bookingMatches(t, [paid] as never)).toEqual([]);
  });
});
