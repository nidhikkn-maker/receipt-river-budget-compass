// Family spending requests: invited family members (their own sign-in) ask for money with
// evidence; the owner approves or declines. Approval never creates a transaction.
// Access is enforced by row-level security and protected database functions.

import { supabase } from "@/integrations/supabase/client";

export type RequestStatus = "pending" | "approved" | "declined" | "withdrawn";
export interface FamilyRequest {
  id: string; ownerId: string; requesterId: string; inviteId: string; title: string; amount: number; category: string;
  neededBy: string | null; note: string; evidencePath: string | null; evidenceName: string | null;
  status: RequestStatus; decisionNote: string; decidedAt: string | null; createdAt: string;
}
export interface FamilyInvite { id: string; memberId: string; email: string; acceptedBy: string | null; revoked: boolean }
export interface InviteForMe { id: string; memberName: string; inviterEmail: string; accepted: boolean; revoked: boolean }

export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

export function normalizeEmail(e: string): string {
  const v = e.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) throw new Error("Enter a valid email address");
  return v;
}

export function validateRequest(r: { title: string; amount: number; neededBy: string | null; file?: { size: number } | null }): void {
  if (!r.title.trim()) throw new Error("Say what the money is for");
  if (r.title.trim().length > 120) throw new Error("Keep the title under 120 characters");
  if (!(r.amount > 0) || r.amount >= 1e8) throw new Error("Enter the amount needed");
  if (r.neededBy && !/^\d{4}-\d{2}-\d{2}$/.test(r.neededBy)) throw new Error("Pick a valid date");
  if (r.file && r.file.size > MAX_EVIDENCE_BYTES) throw new Error("Evidence file must be under 10 MB");
}

const check = (e: { message: string } | null) => { if (e) throw new Error(e.message); };
type Row = { id: string; owner_id: string; requester_id: string; invite_id: string; title: string; amount: number; category: string; needed_by: string | null; note: string; evidence_path: string | null; evidence_name: string | null; status: string; decision_note: string; decided_at: string | null; created_at: string };
const toReq = (r: Row): FamilyRequest => ({ id: r.id, ownerId: r.owner_id, requesterId: r.requester_id, inviteId: r.invite_id, title: r.title, amount: Number(r.amount), category: r.category, neededBy: r.needed_by, note: r.note, evidencePath: r.evidence_path, evidenceName: r.evidence_name, status: r.status as RequestStatus, decisionNote: r.decision_note, decidedAt: r.decided_at, createdAt: r.created_at });

export async function loadFamily() {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id; if (!uid) throw new Error("Sign in again");
  const [inv, reqs, mine] = await Promise.all([
    supabase.from("family_invites").select("id, member_id, email, accepted_by, revoked").eq("owner_id", uid),
    supabase.from("family_requests").select("*").order("created_at", { ascending: false }).limit(200),
    supabase.rpc("my_family_invites"),
  ]);
  check(inv.error); check(reqs.error); check(mine.error);
  const all = (reqs.data as Row[]).map(toReq);
  return {
    uid,
    invites: (inv.data ?? []).map((i) => ({ id: i.id, memberId: i.member_id, email: i.email, acceptedBy: i.accepted_by, revoked: i.revoked })) as FamilyInvite[],
    incoming: all.filter((r) => r.ownerId === uid),
    sent: all.filter((r) => r.requesterId === uid),
    invitesForMe: (mine.data ?? []).map((i) => ({ id: i.id, memberName: i.member_name, inviterEmail: i.inviter_email, accepted: i.accepted, revoked: i.revoked })) as InviteForMe[],
  };
}

export async function inviteMember(ownerId: string, memberId: string, email: string) {
  check((await supabase.from("family_invites").insert({ owner_id: ownerId, member_id: memberId, email: normalizeEmail(email) })).error);
}
export async function setInviteRevoked(id: string, revoked: boolean) { check((await supabase.from("family_invites").update({ revoked }).eq("id", id)).error); }
export async function inviteOwner(id: string): Promise<string | null> { const r = await supabase.rpc("family_invite_owner", { _invite: id }); check(r.error); return (r.data as string | null) ?? null; }
export async function acceptInvite(id: string) { check((await supabase.rpc("accept_family_invite", { _invite: id })).error); }
export async function decideRequest(id: string, status: "approved" | "declined" | "withdrawn", note = "") { check((await supabase.rpc("decide_family_request", { _id: id, _status: status, _note: note })).error); }

export async function sendRequest(uid: string, invite: { id: string; ownerId: string }, r: { title: string; amount: number; category: string; neededBy: string | null; note: string; file: File | null }) {
  validateRequest(r);
  let path: string | null = null;
  if (r.file) {
    path = `${uid}/requests/${crypto.randomUUID()}-${r.file.name.replace(/[^\w.-]+/g, "_").slice(0, 80)}`;
    const up = await supabase.storage.from("receipts").upload(path, r.file, { contentType: r.file.type || "application/octet-stream" });
    if (up.error) throw new Error("Couldn't upload the evidence file");
  }
  const { error } = await supabase.from("family_requests").insert({ owner_id: invite.ownerId, requester_id: uid, invite_id: invite.id, title: r.title.trim(), amount: r.amount, category: r.category, needed_by: r.neededBy, note: r.note.slice(0, 1000), evidence_path: path, evidence_name: r.file?.name.slice(0, 200) ?? null });
  if (error) { if (path) await supabase.storage.from("receipts").remove([path]); throw new Error(error.message); }
}

export async function evidenceUrl(path: string) {
  const { data } = await supabase.storage.from("receipts").createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}
