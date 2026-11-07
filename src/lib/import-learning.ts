import { merchantFamily, type ImportProposal, type ImportRow } from './historical-import';

export type LearningScope = 'one' | 'selected' | 'matching';

/** Similarity is not approval: confirmed records, duplicates and different money directions stay untouched. */
export function similarImportRows(source: ImportRow, rows: ImportRow[], posted: Set<string>) {
  return rows.filter(row => !posted.has(row.fingerprint) && row.decision === 'review' && !row.proposal.reviewed && row.duplicate_kind === 'new'
    && merchantFamily(row.line.description) === merchantFamily(source.line.description)
    && (row.line.direction ?? 'debit') === (source.line.direction ?? 'debit')
    && (row.proposal.txnType ?? 'expense') === (source.proposal.txnType ?? 'expense')
    && row.proposal.accountId === source.proposal.accountId && row.proposal.currency === source.proposal.currency);
}

/** Reusable rules never carry identity, money, transfer destinations, trip tags or approval overrides. */
export function learningMappings(proposal: Partial<ImportProposal>): Partial<ImportProposal> {
  const mappings: Partial<ImportProposal> = {};
  if (proposal.category && !/miscellaneous\s*[—–-]\s*check/i.test(proposal.category)) mappings.category = proposal.category;
  if (proposal.scope) mappings.scope = proposal.scope;
  if (proposal.subcategory !== undefined) mappings.subcategory = proposal.subcategory;
  if (proposal.organisation !== undefined) mappings.organisation = proposal.organisation;
  if (proposal.reimbursable !== undefined) mappings.reimbursable = proposal.reimbursable;
  if (proposal.reimbursementOrganisation !== undefined) mappings.reimbursementOrganisation = proposal.reimbursementOrganisation;
  return mappings;
}

export function learningTargets(source: ImportRow, rows: ImportRow[], posted: Set<string>, selected: Set<string>, scope: LearningScope) {
  if (scope === 'one') return posted.has(source.fingerprint) || source.decision === 'excluded' || source.duplicate_kind === 'exact' ? [] : [source];
  const matches = similarImportRows(source, rows, posted);
  return scope === 'selected' ? matches.filter(row => selected.has(row.id)) : matches;
}