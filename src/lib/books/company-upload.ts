/** Namespace is an exact, reversible UTF-8 entity id, never a display name or a path segment supplied by a file. */
export function companyFilePrefix(owner: string, entity: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(owner) || !entity) throw Error("Invalid company identity");
  const hex = Array.from(new TextEncoder().encode(entity), b => b.toString(16).padStart(2, "0")).join("");
  return `${owner}/companies/${hex}/`;
}

export interface CompanyUploadApi {
  canWrite: (owner: string, entity: string) => Promise<boolean>;
  upload: (path: string, file: File) => Promise<void>;
  save: (id: string, path: string, file: File) => Promise<void>;
  /** Lost responses must be checked before removing an original which may already be referenced. */
  find: (id: string, path: string) => Promise<boolean>;
  remove: (path: string) => Promise<void>;
}

/** Financial records are never written here. Failed metadata saves clean only this new, unreferenced file. */
export async function uploadCompanyDocument(owner: string, entity: string, file: File, api: CompanyUploadApi): Promise<void> {
  if (!(await api.canWrite(owner, entity))) throw Error("You no longer have edit access to this company");
  const id = crypto.randomUUID();
  const path = `${companyFilePrefix(owner, entity)}${id}-${file.name.replace(/[^\w.-]+/g, "_").slice(0, 80)}`;
  await api.upload(path, file);
  try { await api.save(id, path, file); }
  catch (error) {
    // A failed read is not evidence that a save failed; preserve the original for recovery.
    let saved: boolean;
    try { saved = await api.find(id, path); }
    catch { throw Error("Upload status could not be checked. The original has been retained; refresh before retrying."); }
    if (saved) return;
    try { await api.remove(path); }
    catch { throw Error("Document was not saved and the uploaded original could not be removed. Ask the company owner to review the retained file."); }
    throw error;
  }
}