import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireRealAccount } from "@/lib/real-account-middleware";
import { linkState, LINK_DAYS, MAX_FILES, PUBLIC_ORIGIN } from "@/lib/upload-link";

export interface AccountantInfo {
  name: string; email: string; sendDay: number; autoSend: boolean;
  link: null | { url: string; state: string; expiresAt: string; files: number; maxFiles: number; lastEmailedAt: string | null };
}

export const getAccountant = createServerFn({ method: "POST" })
  .middleware([requireRealAccount])
  .handler(async ({ context }): Promise<AccountantInfo> => {
    const { supabase, userId } = context;
    const [{ data: c }, { data: l }] = await Promise.all([
      supabase.from("accountant_contacts").select("*").eq("owner_id", userId).maybeSingle(),
      supabase.from("upload_links").select("*").eq("owner_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const { tokenFor } = await import("@/lib/upload-link.server");
    return {
      name: c?.name ?? "Mr. Durai", email: c?.email ?? "", sendDay: c?.send_day ?? 1, autoSend: c?.auto_send ?? true,
      link: l ? { url: `${PUBLIC_ORIGIN}/u/${await tokenFor(l.id)}`, state: linkState(l), expiresAt: l.expires_at, files: l.file_count, maxFiles: l.max_files, lastEmailedAt: l.last_emailed_at } : null,
    };
  });

export const saveAccountant = createServerFn({ method: "POST" })
  .middleware([requireRealAccount])
  .inputValidator((d: unknown) => z.object({
    name: z.string().trim().min(1).max(80),
    email: z.union([z.literal(""), z.string().trim().email().max(200)]),
    sendDay: z.number().int().min(1).max(28),
    autoSend: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("accountant_contacts").upsert({
      owner_id: context.userId, name: data.name, email: data.email, send_day: data.sendDay, auto_send: data.autoSend, updated_at: new Date().toISOString(),
    });
    if (error) throw new Error("Couldn't save your accountant's details");
    return { ok: true };
  });

/** Creates a fresh 30-day link (turning off the old one) and tries to email it. */
export const sendLinkNow = createServerFn({ method: "POST" })
  .middleware([requireRealAccount])
  .inputValidator((d: unknown) => z.object({ email: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const { createFreshLink } = await import("@/lib/accountant.server");
    const { data: c } = await supabase.from("accountant_contacts").select("*").eq("owner_id", userId).maybeSingle();
    if (data.email && !c?.email) return { ok: false as const, error: "Add your accountant's email first" };
    return { ok: true as const, ...(await createFreshLink(userId, data.email ? c : null)) };
  });

export const turnOffLink = createServerFn({ method: "POST" })
  .middleware([requireRealAccount])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.from("upload_links").update({ revoked_at: new Date().toISOString() }).eq("owner_id", context.userId).is("revoked_at", null);
    if (error) throw new Error("Couldn't turn off the link");
    return { ok: true };
  });

export { LINK_DAYS, MAX_FILES };
