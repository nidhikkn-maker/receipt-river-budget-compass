import { expect, it } from "vitest";
import { bookingDraft, reviewedBooking, type ExtractedBooking } from "./booking-import";
const source: ExtractedBooking = { kind: "flight", provider: "Example Air", reference: "AB1234", date: "2026-11-12", endDate: null, time: "10:30", amount: 2500, currency: "INR", traveller: "Test traveller", location: "Chennai", dueDate: null, cancellationTerms: null, confirmed: true, notes: "Paid in full", text: "confirmation" };
it("imports a confirmation without creating or marking an expense paid", () => {
  const b = reviewedBooking("booking", bookingDraft(source, "original"));
  expect(b).toMatchObject({ amount: 2500, status: "unpaid", confirmation: "confirmed", documentIds: ["original"] });
  expect(b.expenseId).toBeUndefined(); expect(b.expenseIds).toBeUndefined();
});
it("leaves unknown values for review rather than inventing trip dates or totals", () => {
  const d = bookingDraft({ ...source, date: null, amount: null }, "doc");
  expect(d.date).toBe(""); expect(d.amount).toBe(""); expect(() => reviewedBooking("b", d)).toThrow();
});
it("requires an explicit planning rate for foreign currency", () => {
  const d = bookingDraft({ ...source, currency: "USD", amount: 100 }, "doc");
  expect(() => reviewedBooking("b", d)).toThrow("planning exchange rate");
  expect(reviewedBooking("b", { ...d, rate: "85" })).toMatchObject({ originalAmount: 100, amount: 8500 });
});