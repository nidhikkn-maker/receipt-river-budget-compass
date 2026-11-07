import { describe, expect, it, vi } from "vitest";
import { calendarTarget, returnAfterReview } from "./review-navigation";

describe("calendar destinations", () => {
  it("opens the specific trip rather than the trip list", () => {
    expect(calendarTarget({ tripId: "kovai", kind: "trip" })).toEqual({ to: "/trips/$tripId", params: { tripId: "kovai" }, search: { section: "overview" } });
  });
  it("opens the related booking or itinerary section", () => {
    expect(calendarTarget({ tripId: "kovai", kind: "booking" }).search?.section).toBe("bookings");
    expect(calendarTarget({ tripId: "kovai", kind: "itinerary" }).search?.section).toBe("itinerary");
  });
  it("opens payment, loan and document pages", () => {
    expect(calendarTarget({ commitmentId: "rent" })).toEqual({ to: "/plan", hash: "commitment-rent" });
    expect(calendarTarget({ loanId: "home" }).to).toBe("/wealth");
    expect(calendarTarget({ documentId: "policy" }).to).toBe("/vault");
  });
});
describe("completed review return", () => {
  it("returns to the previous page when there is app history", () => {
    const back = vi.fn(), fallback = vi.fn();
    returnAfterReview({ canGoBack: () => true, back }, fallback);
    expect(back).toHaveBeenCalledOnce(); expect(fallback).not.toHaveBeenCalled();
  });
  it("uses a safe app fallback for a direct link", () => {
    const back = vi.fn(), fallback = vi.fn();
    returnAfterReview({ canGoBack: () => false, back }, fallback);
    expect(back).not.toHaveBeenCalled(); expect(fallback).toHaveBeenCalledOnce();
  });
});