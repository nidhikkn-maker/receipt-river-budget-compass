import { signToken, verifyToken } from "./upload-link";

export const linkSecret = () => {
  const s = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!s) throw new Error("Upload links are not configured");
  return s;
};
export const tokenFor = (linkId: string) => signToken(linkSecret(), linkId);
export const linkIdFrom = (token: string) => verifyToken(linkSecret(), token);

/** Emails the upload link to the accountant (one recipient, one link). Fails soft so the app can offer Copy link. */
export async function emailLink(to: string, name: string, ownerName: string, url: string, linkId: string): Promise<{ sent: boolean; reason?: string }> {
  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  try {
    const r = await sendTemplateEmail("accountant-upload-link", to, { templateData: { name, ownerName, url }, idempotencyKey: `accountant-upload-link-${linkId}` });
    return r.sent ? { sent: true } : { sent: false, reason: r.reason };
  } catch (e) {
    const code = (e as { code?: string }).code;
    return { sent: false, reason: code ?? "send_failed" };
  }
}

async function send(template: string, to: string, data: Record<string, unknown>, key: string): Promise<boolean> {
  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  try { return (await sendTemplateEmail(template, to, { templateData: data, idempotencyKey: key })).sent; } catch { return false; }
}

/** Sends the one reminder for this link to the accountant. */
export const emailReminder = (to: string, name: string, ownerName: string, url: string, linkId: string) =>
  send("accountant-upload-reminder", to, { name, ownerName, url }, `accountant-upload-reminder-${linkId}`);

/** Tells the owner (their own sign-in email) that files arrived on their link. */
export const emailOwnerUploaded = (to: string, ownerName: string, accountantName: string, fileName: string, url: string, key: string) =>
  send("accountant-upload-received", to, { ownerName, accountantName, fileName, url }, key);
