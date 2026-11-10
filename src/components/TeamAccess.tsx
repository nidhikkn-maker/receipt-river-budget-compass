import { useMemo, useState } from "react";
import { exportFile } from "@/lib/export-gate";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch as Toggle } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEFAULT_SWITCHES, ROLE_LABEL, TEAM_ACTIONS, allowed, changedFromDefault, companyTaxCsv, useTeamAccess, type TeamAction, type TeamRole } from "@/lib/team-access";
import { money } from "@/lib/expenses";

import { StepUpCancelled, withStepUp } from "@/lib/step-up";

/** Role badge for Settings → Account. */
export function RoleBadge() {
  const { userId } = useStore();
  const { data } = useTeamAccess(userId);
  if (!data) return null;
  return <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">Your access:
    {data.admin && <Badge>Admin</Badge>}<Badge variant="secondary">{data.role ? ROLE_LABEL[data.role] : "Personal only"}</Badge></div>;
}

/** Settings → Team access: admin-only switches per role, member roles and change history. */
export function TeamAccessSettings() {
  const { userId } = useStore();
  const qc = useQueryClient();
  const access = useTeamAccess(userId);
  const team = useQuery({ queryKey: ["admin-team"], enabled: !!access.data?.admin, queryFn: async () => { const r = await supabase.rpc("admin_team"); if (r.error) throw r.error; return r.data ?? []; } });
  const history = useQuery({ queryKey: ["admin-history"], enabled: !!access.data?.admin, queryFn: async () => (await supabase.from("role_permission_audit").select("change, details, created_at").order("created_at", { ascending: false }).limit(20)).data ?? [] });
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ role: string; department: string }>({ role: "", department: "" });
  if (!access.data?.admin) return <p className="text-sm text-muted-foreground">Only an admin can change team access.</p>;
  const switches = access.data.switches;
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["team-access"] }), qc.invalidateQueries({ queryKey: ["admin-team"] }), qc.invalidateQueries({ queryKey: ["admin-history"] })]);
  const setSwitch = async (role: TeamRole, action: TeamAction, value: boolean) => {
    let failed = false;
    try { failed = !!(await withStepUp(() => supabase.rpc("admin_set_permission", { _role: role, _action: action, _allowed: value }))).error; }
    catch (e) { toast.error(e instanceof StepUpCancelled ? e.message : "Couldn't change that switch"); return false; }
    if (failed) { toast.error("Couldn't change that switch"); return false; }
    await refresh();
    return true;
  };
  const reset = async (role: "manager" | "finance") => {
    for (const a of TEAM_ACTIONS) if (allowed(switches, role, a.key) !== DEFAULT_SWITCHES[role][a.key] && !await setSwitch(role, a.key, DEFAULT_SWITCHES[role][a.key])) return;
    toast.success(`${ROLE_LABEL[role]} reset to default`);
  };
  const saveMember = async (id: string, role: string | null, department: string) => {
    let failed = false;
    try { failed = !!(await withStepUp(() => supabase.rpc("admin_set_member", { _user: id, _role: role as string, _department: department }))).error; }
    catch (e) { toast.error(e instanceof StepUpCancelled ? e.message : "Couldn't save this person's access"); return; }
    if (failed) { toast.error("Couldn't save this person's access"); return; }
    setEditing(null); await refresh(); toast.success("Access updated");
  };
  const changed = changedFromDefault(switches).length;
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-sm font-semibold">What each role may do with other people's records</h3>
        <p className="mb-3 text-xs text-muted-foreground">Team roles only see companies the owner has explicitly shared with them. Personal records are never shared. {changed ? `${changed} switch${changed > 1 ? "es" : ""} changed from default.` : ""}</p>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Action</th><th className="p-2">Manager</th><th className="p-2">Finance</th></tr></thead>
            <tbody>{TEAM_ACTIONS.map((a) => <tr key={a.key} className="border-b last:border-0"><td className="p-2">{a.label}</td>
              {(["manager", "finance"] as const).map((r) => <td key={r} className="p-2">{a.key === "view_company_tax" && r === "manager" ? <span className="text-xs text-muted-foreground">Finance only</span> :
                <Toggle aria-label={`${ROLE_LABEL[r]}: ${a.label}`} checked={allowed(switches, r, a.key)} onCheckedChange={(v) => void setSwitch(r, a.key, v)} />}</td>)}</tr>)}</tbody></table>
        </div>
        <div className="mt-2 flex gap-2"><Button size="sm" variant="ghost" onClick={() => reset("manager")}>Reset manager to default</Button><Button size="sm" variant="ghost" onClick={() => reset("finance")}>Reset finance to default</Button></div>
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold">People and roles</h3>
        <ul className="divide-y rounded-xl border">{(team.data ?? []).map((m) => <li key={m.user_id} className="p-3 text-sm">
          {editing === m.user_id ? <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{m.full_name || m.email}</span>
            <Select value={draft.role || "none"} onValueChange={(v) => setDraft({ ...draft, role: v === "none" ? "" : v })}><SelectTrigger className="w-36" aria-label="Role"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">No role</SelectItem>{(["employee", "manager", "finance"] as const).map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}</SelectContent></Select>
            <Input className="w-40" aria-label="Department" value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })} />
            <Button size="sm" onClick={() => saveMember(m.user_id, draft.role || null, draft.department)}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          </div> : <div className="flex flex-wrap items-center justify-between gap-2">
            <div><div className="font-medium">{m.full_name || m.email}{m.user_id === userId && " (you)"}</div><div className="text-xs text-muted-foreground">{m.email} · {m.department}</div></div>
            <div className="flex items-center gap-2"><Badge variant="secondary">{m.role ? ROLE_LABEL[m.role as TeamRole] : "No role"}</Badge>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(m.user_id); setDraft({ role: m.role ?? "", department: m.department }); }}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(m.user_id); setDraft({ role: m.role ?? "", department: m.department }); }}>Move</Button>
              {m.role && <Button size="sm" variant="ghost" onClick={() => saveMember(m.user_id, null, "")}>Remove</Button>}</div>
          </div>}
        </li>)}</ul>
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold">Change history</h3>
        {(history.data ?? []).length === 0 ? <p className="text-xs text-muted-foreground">No changes yet.</p> :
          <ul className="space-y-1 text-xs text-muted-foreground">{(history.data ?? []).map((h, i) => { const d = h.details as { role?: string; action?: string; allowed?: boolean; department?: string }; return <li key={i}>{new Date(h.created_at).toLocaleString("en-IN")} — {h.change === "switch" ? `${ROLE_LABEL[d.role as TeamRole]}: ${TEAM_ACTIONS.find((a) => a.key === d.action)?.label} ${d.allowed ? "on" : "off"}` : `Role set to ${d.role ? ROLE_LABEL[d.role as TeamRole] : "none"}${d.department ? ` · ${String(d.department)}` : ""}`}</li>; })}</ul>}
      </section>
    </div>
  );
}

/** Expenses → Team: read-only list of other people's expenses the database lets this person see. */
export function TeamExpenses() {
  const { userId } = useStore();
  const access = useTeamAccess(userId);
  const role = access.data?.role ?? null;
  const canView = allowed(access.data?.switches ?? [], role, "view_expenses");
  const [person, setPerson] = useState("all");
  const rows = useQuery({
    queryKey: ["team-expenses", userId], enabled: canView,
    queryFn: async () => {
      const [e, p] = await Promise.all([
        supabase.from("expenses").select("id, employee_id, expense_date, title, merchant, category, amount, department").neq("employee_id", userId).eq("txn_type", "expense").order("expense_date", { ascending: false }).limit(500),
        supabase.rpc("team_names"),
      ]);
      if (e.error) throw e.error;
      return { list: e.data ?? [], names: new Map(((p.data ?? []) as { id: string; full_name: string; department: string }[]).map((x) => [x.id, x])) };
    },
  });
  const people = useMemo(() => [...new Set((rows.data?.list ?? []).map((r) => r.employee_id))], [rows.data]);
  if (!canView) return null;
  const list = (rows.data?.list ?? []).filter((r) => person === "all" || r.employee_id === person);
  const nameOf = (id: string) => rows.data?.names.get(id)?.full_name || "Team member";
  return (
    <section className="mt-6 rounded-2xl border p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="font-semibold">Team expenses</h2><p className="text-xs text-muted-foreground">{role === "finance" ? "Everyone" : "Your department"} · view only. Your own totals never include these.</p></div>
        <Select value={person} onValueChange={setPerson}><SelectTrigger className="w-48" aria-label="Person"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All people</SelectItem>{people.map((id) => <SelectItem key={id} value={id}>{nameOf(id)}</SelectItem>)}</SelectContent></Select>
      </div>
      {list.length === 0 ? <p className="text-sm text-muted-foreground">No team expenses to show.</p> :
        <ul className="divide-y text-sm">{list.slice(0, 200).map((r) => <li key={r.id} className="flex items-center justify-between gap-2 py-2">
          <div><div>{r.title || r.merchant || r.category}</div><div className="text-xs text-muted-foreground">{nameOf(r.employee_id)} · {r.expense_date} · {r.category}</div></div>
          <div className="font-medium tabular-nums">{money(Number(r.amount))}</div></li>)}</ul>}
    </section>
  );
}

type CompanyTaxYear = { entityId: string; fy: string; ownershipPct?: number; bookProfit?: number; accumulatedProfits?: number };

/** Tax Centre → Company tax (all): finance-only figures per company and year; personal tax never appears. */
export function TeamCompanyTax() {
  const { userId } = useStore();
  const access = useTeamAccess(userId);
  const ok = allowed(access.data?.switches ?? [], access.data?.role ?? null, "view_company_tax");
  const q = useQuery({ queryKey: ["team-company-tax", userId], enabled: ok, queryFn: async () => { const r = await supabase.rpc("team_company_tax"); if (r.error) throw r.error; return r.data ?? []; } });
  const [year, setYear] = useState("all");
  const companies = useMemo(() => (q.data ?? []).flatMap((o) => (o.entities as { id: string; name: string; kind: string }[]).map((e) => ({
    ...e, owner: String(o.owner_name ?? ""),
    years: (o.profiles as CompanyTaxYear[]).filter((p) => p.entityId === e.id),
  }))), [q.data]);
  const allYears = useMemo(() => [...new Set(companies.flatMap((c) => c.years.map((y) => y.fy)))].sort().reverse(), [companies]);
  if (!ok) return null;
  const fmt = (v: unknown) => (typeof v === "number" ? money(v) : "Unknown");
  const shown = companies.map((c) => ({ ...c, years: c.years.filter((y) => year === "all" || y.fy === year) }));
  const pickYear = (y: string) => { setYear(y); window.__lovableEvents?.track?.("project.company_tax_year_filtered", { year: y }); };
  const exportCsv = () => {
    const rows = shown.flatMap((c) => c.years.map((y) => ({ company: c.name, owner: c.owner, kind: c.kind, fy: y.fy, bookProfit: y.bookProfit, accumulatedProfits: y.accumulatedProfits, ownershipPct: y.ownershipPct })));
    const selectedYear = year === "all" ? "All years" : year;
    void exportFile({ kind: "team_company_tax", rows: rows.length }, new Blob([companyTaxCsv(rows, { exportedOn: new Date().toISOString().slice(0, 10), selectedYear })], { type: "text/csv;charset=utf-8" }), `company-tax-${year === "all" ? "all-years" : year}.csv`);
    window.__lovableEvents?.track?.("project.company_tax_csv_exported", { year: selectedYear, rows: rows.length });
  };
  return (
    <section className="mt-6 rounded-2xl border p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="font-semibold">Company tax (all)</h2>
          <p className="text-xs text-muted-foreground">View only. Company figures entered by each person; personal tax is never shown.</p></div>
        <div className="flex items-center gap-2">
          <Select value={year} onValueChange={pickYear}><SelectTrigger className="w-36" aria-label="Tax year"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All years</SelectItem>{allYears.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent></Select>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={shown.every((c) => c.years.length === 0)}>Download CSV</Button>
        </div>
      </div>
      {companies.length === 0 ? <p className="text-sm text-muted-foreground">No companies to show.</p> :
        shown.map((c) => <div key={c.id} className="border-t py-2 text-sm first:border-0">
          <div className="font-medium">{c.name} <span className="text-xs text-muted-foreground">· {c.owner}</span></div>
          {c.years.length === 0 ? <div className="text-xs text-muted-foreground">{year === "all" ? "No tax years entered." : `Nothing entered for ${year}.`}</div> :
            <ul className="text-xs text-muted-foreground">{c.years.map((y) => <li key={y.fy}>{y.fy}: book profit {fmt(y.bookProfit)} · past profits {fmt(y.accumulatedProfits)} · owner share {typeof y.ownershipPct === "number" ? `${y.ownershipPct}%` : "Unknown"}</li>)}</ul>}
        </div>)}
    </section>
  );
}
