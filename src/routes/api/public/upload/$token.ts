import { createFileRoute } from "@tanstack/react-router";
import { fileProblem, linkState, ownerNotifyDue, PUBLIC_ORIGIN } from "@/lib/upload-link";

// Public upload for the accountant's link: token-signed, add-only, capped per link. Never returns records.
const inactive = () => Response.json({ active: false }, { status: 404 });

async function lookup(token: string) {
  const { linkIdFrom } = await import("@/lib/upload-link.server");
  const id = await linkIdFrom(token);
  if (!id) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("upload_links").select("id, owner_id, expires_at, revoked_at, file_count, max_files").eq("id", id).maybeSingle();
  return data ? { link: data, admin: supabaseAdmin } : null;
}

type Admin = NonNullable<Awaited<ReturnType<typeof lookup>>>["admin"];
/** Emails the owner (their sign-in address) once per batch so they know files arrived. */
async function notifyOwner(admin: Admin, owner: string, linkId: string, fileName: string) {
  const { data: last } = await admin.from("upload_link_events").select("at").eq("link_id", linkId).eq("kind", "owner_notified").order("at", { ascending: false }).limit(1).maybeSingle();
  if (!ownerNotifyDue(last?.at ?? null)) return;
  const { data: u } = await admin.auth.admin.getUserById(owner);
  const to = u?.user?.email;
  if (!to || u.user.is_anonymous) return;
  // Claim the slot first so parallel uploads in one batch send a single email.
  await admin.from("upload_link_events").insert({ owner_id: owner, link_id: linkId, kind: "owner_notified", detail: to });
  const [{ data: p }, { data: c }] = await Promise.all([
    admin.from("profiles").select("full_name").eq("id", owner).maybeSingle(),
    admin.from("accountant_contacts").select("name").eq("owner_id", owner).maybeSingle(),
  ]);
  const { emailOwnerUploaded } = await import("@/lib/upload-link.server");
  await emailOwnerUploaded(to, (p?.full_name ?? "").split(" ")[0], c?.name || "Your accountant", fileName, `${PUBLIC_ORIGIN}/statements`, `accountant-upload-received-${linkId}-${Date.now()}`);
}

export const Route = createFileRoute("/api/public/upload/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const found = await lookup(params.token);
        if (!found || linkState(found.link) !== "active") return inactive();
        // One "opened" entry per link per hour keeps the history readable.
        const hourAgo = new Date(Date.now() - 3600_000).toISOString();
        const { count } = await found.admin.from("upload_link_events").select("id", { count: "exact", head: true }).eq("link_id", found.link.id).eq("kind", "opened").gte("at", hourAgo);
        if (!count) await found.admin.from("upload_link_events").insert({ owner_id: found.link.owner_id, link_id: found.link.id, kind: "opened" });
        const { data: p } = await found.admin.from("profiles").select("full_name").eq("id", found.link.owner_id).maybeSingle();
        const first = (p?.full_name ?? "").split(" ")[0] || "your client";
        return Response.json({ active: true, ownerName: first, remaining: found.link.max_files - found.link.file_count, expiresAt: found.link.expires_at });
      },
      POST: async ({ params, request }) => {
        const found = await lookup(params.token);
        if (!found || linkState(found.link) !== "active") return inactive();
        const form = await request.formData().catch(() => null);
        const file = form?.get("file");
        if (!(file instanceof File)) return Response.json({ error: "No file" }, { status: 400 });
        const name = file.name.replace(/[^\w.() -]/g, "_").slice(-120) || "statement";
        const problem = fileProblem(name, file.size);
        if (problem) return Response.json({ error: problem }, { status: 400 });
        const { data: owner } = await found.admin.rpc("claim_upload_slot", { _link: found.link.id });
        if (!owner) return Response.json({ error: "This link has reached its file limit" }, { status: 409 });
        const path = `${owner}/accountant/${found.link.id}/${crypto.randomUUID()}-${name}`;
        const up = await found.admin.storage.from("statement-uploads").upload(path, file, { contentType: file.type || "application/octet-stream" });
        if (up.error) return Response.json({ error: "Upload failed, please try again" }, { status: 500 });
        const ins = await found.admin.from("accountant_uploads").insert({ owner_id: owner as string, link_id: found.link.id, file_path: path, file_name: name, size_bytes: file.size, mime_type: file.type || "application/octet-stream" });
        if (ins.error) { await found.admin.storage.from("statement-uploads").remove([path]); return Response.json({ error: "Upload failed, please try again" }, { status: 500 }); }
        await found.admin.from("upload_link_events").insert({ owner_id: owner as string, link_id: found.link.id, kind: "uploaded", detail: name });
        await notifyOwner(found.admin, owner as string, found.link.id, name).catch(() => {});
        return Response.json({ ok: true });
      },
    },
  },
});
