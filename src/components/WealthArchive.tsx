/**
 * Archive instead of delete for loans and goals (P0-008, P0-013). WealthPanels.tsx belongs to Track A, so these are
 * ready-made pieces for Track D to wire in place of the Delete icons (exact wiring in the Track C C1 hand-off):
 *   const { active, archived } = useLoansSplit();   // list `active`; `archived` goes to <ArchivedLoans rows={archived} />
 *   <TableArchiveButton table="loans" id={l.id} name={l.name} noun="loan" />
 * The loan / goal rows are never changed or deleted; archive status lives in owner settings (records-archive.ts).
 */
import { money } from "@/lib/expenses";
import { LOAN_TYPE_LABEL } from "@/lib/planning";
import { splitByTableArchive } from "@/lib/records-archive";
import { useStore, type Loan } from "@/lib/store";
import { ArchivedTableRecords } from "./ArchivedRecords";

export { TableArchiveButton } from "./ArchivedRecords";

export function useLoansSplit() {
  const { loans, preferences } = useStore();
  return splitByTableArchive(preferences, "loans", loans);
}
export function useGoalsSplit() {
  const { goals, preferences } = useStore();
  return splitByTableArchive(preferences, "goals", goals);
}

export function ArchivedLoans({ rows }: { rows: Loan[] }) {
  return <ArchivedTableRecords id="archived-loans" table="loans" rows={rows} noun="loan" title={`Archived loans (${rows.length})`} nameOf={(l) => l.name}
    describe={(l) => `${LOAN_TYPE_LABEL[l.loanType]} · ${money(l.principal)} outstanding · ${l.status} · still counted in what you owe`} />;
}
export function ArchivedGoals({ rows }: { rows: { id?: string | undefined; name: string; saved: number; target: number; reserve: boolean }[] }) {
  return <ArchivedTableRecords id="archived-goals" table="goals" rows={rows} noun="goal" title={`Archived goals (${rows.length})`} nameOf={(g) => g.name}
    describe={(g) => `${money(g.saved)} of ${money(g.target)}${g.reserve ? " · still held back from safe-to-spend" : ""}`} />;
}
