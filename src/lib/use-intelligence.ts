import { useMemo } from "react";
import { emergencyFund, type Metrics } from "./intelligence";
import { useStore } from "./store";
import { todayISO, usePosition } from "./use-position";

/** Shared verified figures for the Strategy, Patterns, Trips and Brief screens. */
export function useIntelligence() {
  const store = useStore();
  const p = usePosition(60);
  const today = todayISO();
  const { accounts, transactions, loans, goals, preferences } = store;
  const emis = loans.filter((l) => l.status !== "closed").reduce((s, l) => s + l.emi, 0);
  const earmarked = goals.filter((g) => !g.reserve).reduce((s, g) => s + g.saved, 0);
  const ef = useMemo(() => emergencyFund(preferences.emergency, accounts, transactions, emis, earmarked, today), [preferences.emergency, accounts, transactions, emis, earmarked, today]);
  const metrics: Metrics = useMemo(() => ({
    emergencyAmount: ef.reserves, emergencyMonths: ef.coverage, netWorth: p.netWorth.net, savings: p.cash,
    cardDebt: p.cards.reduce((s, c) => s + Math.max(0, c.due), 0), loans: loans.map((l) => ({ name: l.name, principal: l.principal })),
  }), [ef, p, loans]);
  return { store, p, today, ef, metrics, emis };
}
