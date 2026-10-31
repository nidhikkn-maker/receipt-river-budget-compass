import { useMemo } from "react";
import { useStore } from "./store";
import { assistantFacts, position, type PositionInput } from "./position";

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function useInput(days: number, includeUnconfirmed: boolean): PositionInput {
  const { accounts, transactions, commitments, goals, loans, valuations, budgets, preferences } = useStore();
  const cardAlertPct = preferences.cardAlertPct;
  return useMemo(() => ({ accounts, transactions, commitments, goals, loans, valuations, budgets: budgets as Record<string, number>, cardAlertPct, today: todayISO(), days, includeUnconfirmed }),
    [accounts, transactions, commitments, goals, loans, valuations, budgets, cardAlertPct, days, includeUnconfirmed]);
}

export function usePosition(days = 30, includeUnconfirmed = false) {
  const i = useInput(days, includeUnconfirmed);
  return useMemo(() => position(i), [i]);
}

export function useAssistantFacts(days = 30) {
  const i = useInput(days, false);
  return useMemo(() => assistantFacts(i), [i]);
}
