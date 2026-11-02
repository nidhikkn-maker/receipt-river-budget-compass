import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireRealAccount } from "@/lib/real-account-middleware";
import { linkHistory, requestReport, type LinkEvent, type RequestLink, type UploadRequest, linkState, LINK_DAYS, MAX_FILES, PUBLIC_ORIGIN } from "@/lib/upload-link";

export interface AccountantInfo {
  name: string; email: string; sendDay: number; autoSend: boolean;
  history: LinkEvent[];
  link: null | { url: string; state: string; expiresAt: string; files: number; maxFiles: number; lastEmailedAt: string | null };
}

export const getAccountant = createServerFn({ method: "POST" })
  .middleware([requireRealAccount])
  .handler(async ({ context }): Promise<AccountantInfo> => {
    const { supabase, userId } = context;
    const [{ data: c }, { data: l }, { data: ev }, { data: links }] = await Promise.all([
      supabase.from("accountant_contacts").select("*").eq("owner_id", userId).maybeSingle(),
      supabase.from("upload_links").select("*").eq("owner_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("upload_link_events").select("link_id, kind, detail, at").eq("owner_id", userId).order("at", { ascending: false }).limit(200),
      supabase.from("upload_links").select("id, expires_at, revoked_at").eq("owner_id", userId).order("created_at", { ascending: false }).limit(50),
    ]);
    const { tokenFor } = await import("@/lib/upload-link.server");
    return {
      history: linkHistory((ev ?? []).map((e) => ({ linkId: e.link_id, kind: e.kind as LinkEvent["kind"], detail: e.detail, at: e.at })), links ?? []).slice(0, 200),
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
    const { data: open, error } = await context.supabase.from("upload_links").update({ revoked_at: new Date().toISOString() }).eq("owner_id", context.userId).is("revoked_at", null).select("id");
    if (error) throw new Error("Couldn't turn off the link");
    if (open?.length) await context.supabase.from("upload_link_events").insert(open.map((l) => ({ owner_id: context.userId, link_id: l.id, kind: "turned_off" })));
    return { ok: true };
  });

export { LINK_DAYS, MAX_FILES };

/** One row per monthly upload request: link status, email, opens, files, reminder and owner confirmation. */
export const getUploadRequests = createServerFn({ method: "POST" })
  .middleware([requireRealAccount])
  .handler(async ({ context }): Promise<UploadRequest[]> => {
    const { supabase, userId } = context;
    const [{ data: links }, { data: ev }, { data: ups }] = await Promise.all([
      supabase.from("upload_links").select("id, created_at, expires_at, revoked_at, file_count, max_files, last_emailed_at").eq("owner_id", userId).order("created_at", { ascending: false }).limit(24),
      supabase.from("upload_link_events").select("link_id, kind, detail, at").eq("owner_id", userId).order("at", { ascending: false }).limit(1000),
      supabase.from("accountant_uploads").select("link_id, file_name, uploaded_at, consumed_at").eq("owner_id", userId).order("uploaded_at", { ascending: false }).limit(1000),
    ]);
    return requestReport(
      (links ?? []) as RequestLink[],
      (ev ?? []).map((e) => ({ linkId: e.link_id, kind: e.kind as LinkEvent["kind"], detail: e.detail, at: e.at })),
      (ups ?? []).map((u) => ({ linkId: u.link_id, fileName: u.file_name, uploadedAt: u.uploaded_at, consumedAt: u.consumed_at })),
    );
  });

