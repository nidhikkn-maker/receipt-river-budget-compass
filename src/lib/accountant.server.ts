import { PUBLIC_ORIGIN } from "./upload-link";
import { emailLink, tokenFor } from "./upload-link.server";

type Contact = { name: string; email: string } | null;

/** Turns off the owner's open links, makes a new one and optionally emails it. Server only. */
export async function createFreshLink(ownerId: string, contact: Contact) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date().toISOString();
  await supabaseAdmin.from("upload_links").update({ revoked_at: now }).eq("owner_id", ownerId).is("revoked_at", null);
  const { data: link, error } = await supabaseAdmin.from("upload_links").insert({ owner_id: ownerId }).select("id").single();
  if (error || !link) throw new Error("Couldn't create the upload link");
  await supabaseAdmin.from("upload_link_events").insert({ owner_id: ownerId, link_id: link.id, kind: "created" });
  const url = `${PUBLIC_ORIGIN}/u/${await tokenFor(link.id)}`;
  let emailed: { sent: boolean; reason?: string } = { sent: false, reason: "not_requested" };
  if (contact?.email) {
    const { data: p } = await supabaseAdmin.from("profiles").select("full_name").eq("id", ownerId).maybeSingle();
    emailed = await emailLink(contact.email, contact.name, p?.full_name || "your client", url, link.id);
    if (emailed.sent) {
      await supabaseAdmin.from("upload_links").update({ last_emailed_at: now }).eq("id", link.id);
      await supabaseAdmin.from("upload_link_events").insert({ owner_id: ownerId, link_id: link.id, kind: "emailed", detail: contact.email });
    }
  }
  return { url, emailed: emailed.sent, reason: emailed.reason ?? null };
}
