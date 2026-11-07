/** Every URL is minted against current access; already-issued bearer URLs last until expiry. */
export const PRIVATE_URL_SECONDS = 60;
export interface PrivateFileApi { canRead: (path: string) => Promise<boolean>; sign: (path: string, seconds: number) => Promise<string | null> }
export async function privateFileUrl(path: string, api: PrivateFileApi): Promise<string | null> {
  if (!path || path.startsWith("/") || path.split("/").some(s => !s || s === "." || s === "..") || /[\\\x00-\x1f]/.test(path)) return null;
  if (!(await api.canRead(path))) return null;
  return api.sign(path, PRIVATE_URL_SECONDS);
}