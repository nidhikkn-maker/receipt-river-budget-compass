/* Photo taken from the home "Scan receipt" button, handed once in memory to the new expense page. */
let pending: File[] | null = null;
export function setPendingScan(files: File[]) { pending = files.length ? files : null; }
export function takePendingScan(): File[] | null { const f = pending; pending = null; return f; }
