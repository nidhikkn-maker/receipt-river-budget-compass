export function returnAfterReview(history: { canGoBack: () => boolean; back: () => void }, fallback: () => void) {
  if (history.canGoBack()) history.back();
  else fallback();
}

export interface CalendarTargetItem {
  tripId?: string;
  kind?: string;
  commitmentId?: string;
  loanId?: string;
  documentId?: string;
}

export function calendarTarget(item: CalendarTargetItem) {
  if (item.tripId) return { to: "/trips/$tripId" as const, params: { tripId: item.tripId }, search: { section: item.kind === "booking" ? "bookings" as const : item.kind === "itinerary" ? "itinerary" as const : "overview" as const } };
  if (item.loanId) return { to: "/wealth" as const };
  if (item.documentId) return { to: "/vault" as const };
  return { to: "/plan" as const, hash: item.commitmentId ? `commitment-${item.commitmentId}` : "payments" };
}