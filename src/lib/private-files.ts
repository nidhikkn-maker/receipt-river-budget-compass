/** Every URL is minted against current access; already-issued bearer URLs last until expiry. */
export const PRIVATE_URL_SECONDS = 60;
export interface PrivateFileApi { canRead: (path: string) => Promise<boolean>; sign: (path: string, seconds: number) => Promise<string | null> }
export async function privateFileUrl(path: string, api: PrivateFileApi): Promise<string | null> {
  if (!path || path.startsWith("/") || path.split("/").some(s => !s || s === "." || s === "..") || /[\\\x00-\x1f]/.test(path)) return null;
  if (!(await api.canRead(path))) return null;
  return api.sign(path, PRIVATE_URL_SECONDS);
}

export interface ExpectedFile { size?: number | null | undefined; mimeType?: string | null | undefined; sha256?: string | null | undefined }
export class PrivateFileError extends Error {}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Fetches the actual stored bytes behind a signed URL and refuses anything that is not the original:
 * failed responses, empty bodies, size or checksum mismatches. Opening a cross-origin signed URL in a
 * tab never produces a saved file (the download attribute is ignored cross-origin), so real downloads
 * must go through these bytes.
 */
export async function fetchPrivateFile(url: string, expected: ExpectedFile = {}, fetcher: typeof fetch = fetch): Promise<Blob> {
  const res = await fetcher(url);
  if (!res.ok) throw new PrivateFileError(res.status === 400 || res.status === 403 ? "Access to this file has ended" : `Download failed (${res.status})`);
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength === 0) throw new PrivateFileError("The stored file came back empty");
  if (expected.size != null && expected.size > 0 && bytes.byteLength !== expected.size) throw new PrivateFileError(`File size mismatch: expected ${expected.size} bytes, received ${bytes.byteLength}`);
  if (expected.sha256 && (await sha256Hex(bytes)) !== expected.sha256.toLowerCase()) throw new PrivateFileError("File checksum does not match the original");
  const type = expected.mimeType || res.headers.get("content-type") || "application/octet-stream";
  return new Blob([bytes], { type });
}
