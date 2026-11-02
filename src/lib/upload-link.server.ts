import { signToken, verifyToken } from "./upload-link";

export const linkSecret = () => {
  const s = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!s) throw new Error("Upload links are not configured");
  return s;
};
export const tokenFor = (linkId: string) => signToken(linkSecret(), linkId);
export const linkIdFrom = (token: string) => verifyToken(linkSecret(), token);

/**
 * Emails the upload link to the accountant. Sending needs a verified sender domain;
 * until one is set up this reports "not_setup" so the app can offer Copy link instead.
 */
export async function emailLink(_to: string, _name: string, _ownerName: string, _url: string, _linkId: string): Promise<{ sent: boolean; reason?: string }> {
  return { sent: false, reason: "not_setup" };
}
