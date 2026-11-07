import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { confirmAction } from "@/lib/confirm";
import { getAccountant, saveAccountant, sendLinkNow, turnOffLink, type AccountantInfo } from "@/lib/accountant.functions";

const STATE: Record<string, string> = { active: "Active", expired: "Expired", revoked: "Turned off", full: "Full" };
const fmt = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export function AccountantSettings() {
  const load = useServerFn(getAccountant), save = useServerFn(saveAccountant), sendFn = useServerFn(sendLinkNow), offFn = useServerFn(turnOffLink);
  const [info, setInfo] = useState<AccountantInfo | null>(null);
  const [edit, setEdit] = useState<null | { name: string; email: string; sendDay: number; autoSend: boolean }>(null);
  const [err, setErr] = useState<string | null>(null);
  const reload = () => load().then(setInfo).catch((e) => setErr(e instanceof Error ? e.message : "Couldn't load"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void reload(); }, []);

  const copy = async (url: string) => { await navigator.clipboard.writeText(url).catch(() => {}); toast.success("Upload link copied"); };
  const fresh = async (email: boolean) => {
    const r = await sendFn({ data: { email } });
    if (!r.ok) { toast.error(r.error); return; }
    await reload();
    if (email && r.emailed) toast.success(`Link emailed to ${info?.name}`);
    else { await copy(r.url); if (email) toast.message(r.reason === "domain_not_verified" ? "Email is still being verified — the new link was copied so you can share it." : r.reason === "recipient_suppressed" ? "That address has opted out of emails — the new link was copied instead." : "The email couldn't be sent — the new link was copied so you can share it."); }
  };

  if (err) return <p className="text-sm text-destructive">{err}</p>;
  if (!info) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const l = info.link;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 rounded-lg border bg-card p-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{info.name}</p>
          <p className="truncate text-sm text-muted-foreground">{info.email || "No email yet"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{info.autoSend ? `New link emailed on day ${info.sendDay} of each month` : "Automatic email off"}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Accountant actions"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEdit({ name: info.name, email: info.email, sendDay: info.sendDay, autoSend: info.autoSend })}>Edit name & email</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void fresh(true)}>Send new link now</DropdownMenuItem>
            {l && l.state === "active" && <DropdownMenuItem onSelect={() => void copy(l.url)}>Copy link</DropdownMenuItem>}
            {!l || l.state !== "active" ? <DropdownMenuItem onSelect={() => void fresh(false)}>Create & copy new link</DropdownMenuItem> : null}
            {l && l.state === "active" && <DropdownMenuItem className="text-destructive" onSelect={async () => {
              if (!(await confirmAction({ title: "Turn off upload link?", message: `${info.name} won't be able to upload with the current link. You can send a new one any time.`, confirmLabel: "Turn off" }))) return;
              await offFn(); await reload(); toast.success("Link turned off");
            }}>Turn off link</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {l && (
        <p className="text-sm text-muted-foreground">
          Current link: <span className="font-medium text-foreground">{STATE[l.state] ?? l.state}</span> · {l.files} of {l.maxFiles} files · until {fmt(l.expiresAt)}
          {l.lastEmailedAt ? ` · emailed ${fmt(l.lastEmailedAt)}` : ""}
        </p>
      )}
      <LinkHistory items={info.history} name={info.name} />
      <p className="text-xs text-muted-foreground">Uploaded files appear in Statement Desk for matching. The link never gives access to your app or records.</p>
      <p className="text-sm"><Link to="/upload-requests" className="text-primary">See every monthly request (Monthly requests tab)</Link></p>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Accountant</DialogTitle><DialogDescription>Who gets the monthly upload link.</DialogDescription></DialogHeader>
          {edit && (
            <div className="space-y-3">
              <label className="block text-sm">Name<Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
              <label className="block text-sm">Email<Input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></label>
              <label className="block text-sm">Day of month to email (1–28)<Input type="number" min={1} max={28} value={edit.sendDay} onChange={(e) => setEdit({ ...edit, sendDay: Math.min(28, Math.max(1, Number(e.target.value) || 1)) })} /></label>
              <label className="flex items-center justify-between text-sm">Email a new link every month<Switch checked={edit.autoSend} onCheckedChange={(v) => setEdit({ ...edit, autoSend: v })} /></label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
            <Button onClick={async () => {
              if (!edit) return;
              try { await save({ data: edit }); setEdit(null); await reload(); toast.success("Saved"); }
              catch { toast.error("Check the name and email address"); }
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const LABEL: Record<string, string> = { created: "New link created", emailed: "Link emailed", opened: "Link opened", uploaded: "File uploaded", turned_off: "Link turned off", expired: "Link expired", reminded: "Reminder emailed", owner_notified: "You were emailed about uploads" };

function LinkHistory({ items, name }: { items: AccountantInfo["history"]; name: string }) {
  const [all, setAll] = useState(false);
  if (!items.length) return <p className="text-sm text-muted-foreground">No link activity yet.</p>;
  const shown = all ? items : items.slice(0, 8);
  const when = (d: string) => new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  return (
    <section aria-label="Link activity" className="rounded-lg border">
      <p className="border-b px-3 py-2 text-sm font-medium">Link activity</p>
      <ul className="divide-y">
        {shown.map((e, i) => (
          <li key={i} className="flex items-baseline gap-3 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1">
              {LABEL[e.kind] ?? e.kind}
              {e.kind === "emailed" && e.detail ? <span className="text-muted-foreground"> to {e.detail}</span> : null}
              {e.kind === "opened" ? <span className="text-muted-foreground"> by {name}</span> : null}
              {e.kind === "uploaded" && e.detail ? <span className="block truncate text-xs text-muted-foreground">{e.detail}</span> : null}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">{when(e.at)}</span>
          </li>
        ))}
      </ul>
      {items.length > 8 && <button type="button" className="w-full border-t px-3 py-2 text-sm text-primary" onClick={() => setAll(!all)}>{all ? "Show less" : `Show all ${items.length}`}</button>}
    </section>
  );
}
