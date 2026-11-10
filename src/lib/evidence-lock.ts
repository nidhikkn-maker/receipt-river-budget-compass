// D8 / P0-035: an original marked as audit evidence (documents.evidence_locked, 0059) keeps both its row and its file.
// The app refuses before any storage or row call; proposed P17 refuses the storage delete/overwrite server-side.
export const LOCKED_EVIDENCE_MESSAGE = "This original is kept as audit evidence. Unlock it before deleting.";

export class LockedEvidenceError extends Error {
  constructor() { super(LOCKED_EVIDENCE_MESSAGE); this.name = "LockedEvidenceError"; }
}

/** Throws LockedEvidenceError when the document is locked evidence; nothing else is checked here. */
export function assertNotLockedEvidence(d: { evidenceLocked?: boolean | null | undefined }): void {
  if (d.evidenceLocked) throw new LockedEvidenceError();
}
