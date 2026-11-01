// What to do with a statement line that has no record: save it, ask, or leave it (pure, tested).
import { classifyStatementLine, draftToInput, type StatementContext, type StatementDraft } from "../statement-auto";
import type { ExpenseInput } from "../expenses";
import { pairOpposites } from "./match";
import { toStatementLine, type StmtLine } from "./line";

export interface LineDecision {
  line: StmtLine;
  /** "auto" is saved on its own; "ask" waits for a person. */
  group: "auto" | "ask";
  reason: string;
  draft: StatementDraft;
  /** The statement line this one pairs with as one movement between two of your own accounts. */
  transferWith?: StmtLine | undefined;
  /** True when the destination account must be chosen before anything can be saved. */
  needsDestination?: boolean;
}

const MOVE = new Set(["transfer", "card_payment", "loan_repayment", "investment"]);

/**
 * Splits lines with no record into safe-to-save and must-ask, and pairs own-account movements
 * across the files uploaded together. Category guesses and income are always asked about.
 */
export function classifyMissing(missing: StmtLine[], otherFiles: StmtLine[], ctx: StatementContext): LineDecision[] {
  const pairs = pairOpposites(missing, otherFiles);
  return missing.map((line) => {
    const draft = classifyStatementLine(toStatementLine(line), ctx);
    const withKey = pairs.get(line.key);
    const transferWith = withKey ? otherFiles.find((o) => o.key === withKey) : undefined;
    if (transferWith) {
      return { line, group: "ask" as const, reason: `Same amount and date on ${transferWith.file} the other way — one movement between two of your accounts. Confirm where it went.`, draft, transferWith, needsDestination: true };
    }
    if (MOVE.has(draft.txnType)) return { line, group: "ask" as const, reason: draft.reason, draft, needsDestination: true };
    if (draft.txnType === "income" && /confirm/.test(draft.reason)) return { line, group: "ask" as const, reason: "Money coming in — tell us it is income before it is saved", draft };
    if (draft.uncertain) return { line, group: "ask" as const, reason: `Category is only a guess (${draft.category}) — check it before saving`, draft };
    return { line, group: "auto" as const, reason: draft.reason, draft };
  });
}

/** The ledger entry a decision would create, once any destination account is filled in. */
export function decisionInput(d: LineDecision, opts: { statementAccountId: string | null; destination?: string | null }): ExpenseInput {
  const input = draftToInput(d.draft);
  const dest = opts.destination ?? null;
  if (!d.needsDestination || !dest) return input;
  if (d.line.direction === "debit") { input.accountId = opts.statementAccountId; input.toAccountId = dest; }
  else { input.accountId = dest; input.toAccountId = opts.statementAccountId; }
  return input;
}
