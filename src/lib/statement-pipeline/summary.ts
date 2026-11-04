// Pre-save reconciliation summary for one statement (pure, tested). Reports only; never changes the plan.
import { balanceAddsUp } from "./line";
import type { AccountPlan } from "./plan";

export interface ReconSummary {
  matched: number; toSave: number; needDecision: number; held: number; wrongKind: number; elsewhere: number; notOnStatement: number;
  /** Statement lines with no record in the app and nothing that will save them without you. */
  unmatchedLines: number;
  /** Opening + lines vs printed closing, from the file alone. Null when no balances are printed. */
  statementGap: number | null;
  /** App balance after saving vs the statement's closing figure. Null when it can't be compared. */
  appGap: number | null;
  ok: boolean;
}

export function reconSummary(a: AccountPlan): ReconSummary {
  const statementGap = balanceAddsUp(a.file.opening, a.file.closing, a.file.lines, a.liability);
  const appGap = a.gate && !a.newerEntries && a.gate.difference !== null ? Math.round(a.gate.difference * 100) / 100 : null;
  const unmatchedLines = a.ask.length + a.later.length + a.elsewhere.length;
  const s = { matched: a.matched.length, toSave: a.auto.length, needDecision: a.ask.length, held: a.later.length, wrongKind: a.wrongKind.length, elsewhere: a.elsewhere.length, notOnStatement: a.unexplained.length, unmatchedLines, statementGap, appGap };
  return { ...s, ok: unmatchedLines === 0 && a.wrongKind.length === 0 && a.unexplained.length === 0 && (statementGap ?? 0) === 0 && Math.abs(appGap ?? 0) < 0.01 };
}
