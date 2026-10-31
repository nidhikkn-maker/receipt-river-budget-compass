import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { money } from "@/lib/expenses";
import { useStore } from "@/lib/store";
import { acceptInvite, decideRequest, evidenceUrl, inviteMember, loadFamily, sendRequest, setInviteRevoked, type FamilyRequest } from "@/lib/family-requests";

type Data = Awaited<ReturnType<typeof loadFamily>>;
const STATUS: Record<FamilyRequest["status"], string> = { pending: "Waiting", approved: "Approved", declined: "Declined", withdrawn: "Withdrawn" };

export function FamilyRequests() {
  const { members } = useStore();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [f, setF] = useState({ invite: "", title: "", amount: 0, neededBy: "", note: "" });
  const [file, setFile] = useState<File | null>(null);
  const reload = useCallback(async () => { try { setD(await loadFamily()); setErr(null); } catch (e) { setErr((e as Error).message); } }, []);
  useEffect(() => { void reload(); }, [reload]);
  const run = async (fn: () => Promise<void>, ok: string) => { setBusy(true); try { await fn(); toast.success(ok); await reload(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } };
  const openEvidence = async (path: string) => { const u = await evidenceUrl(path); if (!u) { toast.error("Couldn't open the file"); return; } window.open(u, "_blank", "noopener,noreferrer"); };

  if (err) return <Card title="Family requests"><p className="text-sm text-destructive">{err}</p><Button size="sm" className="mt-2" onClick={() => void reload()}>Try again</Button></Card>;
  if (!d) return <p className="text-sm text-muted-foreground">Loading family requests…</p>;
  const accepted = d.invitesForMe.filter((i) => i.accepted && !i.revoked);
  const pendingForMe = d.invitesForMe.filter((i) => !i.accepted && !i.revoked);
  const ownerOf = (inviteId: string) => d.sent.find((r) => r.inviteId === inviteId)?.ownerId;

  return (
    <>
      {pendingForMe.map((i) => (
        <Card key={i.id} title="You've been invited">
          <p className="text-sm">{i.inviterEmail} invited you as <b>{i.memberName}</b>. You'll be able to send spending requests — you won't see their accounts or records.</p>
          <Button size="sm" className="mt-2" disabled={busy} onClick={() => void run(() => acceptInvite(i.id), "Invitation accepted")}>Accept</Button>
        </Card>
      ))}

      {accepted.length > 0 && (
        <Card title="Ask for money">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label>Send to</Label>
              <select className="h-11 w-full rounded-md border bg-background px-3" value={f.invite} onChange={(e) => setF({ ...f, invite: e.target.value })}>
                <option value="">Choose…</option>{accepted.map((i) => <option key={i.id} value={i.id}>{i.inviterEmail} (as {i.memberName})</option>)}
              </select></div>
            <div className="sm:col-span-2"><Label>What is it for?</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. School trip fee" /></div>
            <div><Label>Amount (₹)</Label><Input type="number" value={f.amount || ""} onChange={(e) => setF({ ...f, amount: Number(e.target.value) || 0 })} /></div>
            <div><Label>Needed by</Label><Input type="date" value={f.neededBy} onChange={(e) => setF({ ...f, neededBy: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Note</Label><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Evidence (bill, quote, photo)</Label><Input type="file" accept="image/*,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
          </div>
          <Button className="mt-3" disabled={busy || !f.invite} onClick={() => void run(async () => {
            const known = ownerOf(f.invite);
            const ownerId = known ?? (await (await import("@/integrations/supabase/client")).supabase.from("family_invites").select("owner_id").eq("id", f.invite).maybeSingle()).data?.owner_id;
            if (!ownerId) throw new Error("This invitation is no longer available");
            await sendRequest(d.uid, { id: f.invite, ownerId }, { title: f.title, amount: f.amount, category: "Miscellaneous", neededBy: f.neededBy || null, note: f.note, file });
            setF({ ...f, title: "", amount: 0, neededBy: "", note: "" }); setFile(null);
          }, "Request sent")}>Send request</Button>
        </Card>
      )}

      {d.sent.length > 0 && <Card title="Requests I've sent">
        {d.sent.map((r) => <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm last:border-0">
          <span><b>{r.title}</b> · {money(r.amount)} · {STATUS[r.status]}{r.decisionNote ? ` — “${r.decisionNote}”` : ""}</span>
          {r.status === "pending" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => decideRequest(r.id, "withdrawn"), "Request withdrawn")}>Withdraw</Button>}
        </div>)}
      </Card>}

      <Card title="Requests from family">
        {d.incoming.length === 0 ? <p className="text-sm text-muted-foreground">No requests yet. Invite a family member below so they can ask with their own sign-in.</p> :
          d.incoming.map((r) => <div key={r.id} className="border-b py-3 text-sm last:border-0">
            <div className="flex justify-between gap-3"><b>{r.title}</b><span className="font-mono">{money(r.amount)}</span></div>
            <p className="text-xs text-muted-foreground">From {members.find((m) => m.id === d.invites.find((i) => i.id === r.inviteId)?.memberId)?.name ?? "family member"} · {r.createdAt.slice(0, 10)}{r.neededBy ? ` · needed by ${r.neededBy}` : ""} · {STATUS[r.status]}</p>
            {r.note && <p className="mt-1">{r.note}</p>}
            {r.evidencePath && <Button size="sm" variant="link" className="h-auto p-0" onClick={() => void openEvidence(r.evidencePath!)}>Open evidence ({r.evidenceName})</Button>}
            {r.status === "pending" && <div className="mt-2 flex flex-wrap gap-2">
              <Input className="h-9 max-w-xs" placeholder="Reply (optional)" value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
              <Button size="sm" disabled={busy} onClick={() => void run(() => decideRequest(r.id, "approved", notes[r.id]), "Approved")}>Approve</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => decideRequest(r.id, "declined", notes[r.id]), "Declined")}>Decline</Button>
            </div>}
            {r.status === "approved" && <p className="mt-1 text-xs text-muted-foreground">Approval doesn't move money. Add the expense yourself when you pay.</p>}
          </div>)}
      </Card>

      {members.length > 0 && <Card title="Family sign-ins">
        <p className="mb-2 text-xs text-muted-foreground">Invited people sign in with their own email. They can only send requests and see their own — never your accounts.</p>
        {members.map((m) => {
          const inv = d.invites.find((i) => i.memberId === m.id);
          return <div key={m.id} className="flex flex-wrap items-center gap-2 border-b py-2 text-sm last:border-0">
            <span className="w-28 font-semibold">{m.name}</span>
            {inv ? <>
              <span className="text-muted-foreground">{inv.email} · {inv.revoked ? "Access removed" : inv.acceptedBy ? "Connected" : "Invited — ask them to sign in at ledgerline.biz with this email"}</span>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => setInviteRevoked(inv.id, !inv.revoked), inv.revoked ? "Access restored" : "Access removed")}>{inv.revoked ? "Restore" : "Remove access"}</Button>
            </> : <>
              <Input className="h-9 max-w-xs" type="email" placeholder="Their email" value={emails[m.id] ?? ""} onChange={(e) => setEmails({ ...emails, [m.id]: e.target.value })} />
              <Button size="sm" disabled={busy} onClick={() => void run(() => inviteMember(d.uid, m.id, emails[m.id] ?? ""), "Invitation saved")}>Invite</Button>
            </>}
          </div>;
        })}
      </Card>}
    </>
  );
}
