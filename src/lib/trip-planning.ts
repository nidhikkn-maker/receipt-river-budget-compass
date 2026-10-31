import { tripFinance, type TravelTrip } from "./travel";
import { tripSummary } from "./intelligence";
import { SCOPE_LABEL } from "./expenses";

type Transactions = Parameters<typeof tripFinance>[1];
export function tripAllocationPlans(trip: TravelTrip, transactions: Transactions) {
  const finance = tripFinance(trip, transactions);
  const entries = tripSummary(trip, transactions).entries;
  const person: Record<string, number> = {};
  for (const entry of entries) {
    const e = entry as typeof entry & { memberId?: string | null; splits?: { memberId: string | null; amount: number }[] };
    const shares = e.splits?.length ? e.splits.map(s => ({ who: s.memberId ?? "Me", amount: s.amount / (e.originalAmount || e.amount) * e.amount })) : [{ who: e.memberId ?? "Me", amount: e.amount }];
    for (const share of shares) person[share.who] = (person[share.who] ?? 0) + share.amount;
  }
  const row = (label: string, budget: number, actual: number) => ({ label, budget, actual: Math.round(actual * 100) / 100, left: Math.round((budget - actual) * 100) / 100 });
  return {
    workspace: (trip.workspaceBudgets ?? []).map(b => row(SCOPE_LABEL[b.workspace], b.amount, finance.byWorkspace[b.workspace] ?? 0)),
    traveller: (trip.travellerBudgets ?? []).map(b => row(b.traveller, b.amount, person[b.traveller] ?? 0)),
    currencies: (trip.currencyBudgets ?? []).map(b => ({ ...b, inr: Math.round(b.amount * b.planningRate * 100) / 100 })),
  };
}

export function validatePlanAmount(amount: number, rate = 1) {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(rate) || rate <= 0) throw new Error("Enter a positive budget and exchange rate");
}