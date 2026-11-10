/**
 * Team access (employee / manager / finance / admin). The database enforces every rule; these helpers only
 * decide what to show. Pure labels plus small client reads of the caller's own role, admin flag and switches.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const TEAM_ACTIONS = [
  { key: "view_expenses", label: "View team expenses" },
  { key: "edit_expenses", label: "Edit team expenses (money, dates and accounts by approved request)" },
  { key: "delete_expenses", label: "Request withdrawal of team expenses (never deleted; owner or Finance approves)" },
  { key: "change_category", label: "Change category" },
  { key: "approve", label: "Approve / return" },
  { key: "view_receipts", label: "View receipts" },
  { key: "view_company_tax", label: "View company tax" },
  { key: "edit_budgets", label: "Edit department budgets" },
] as const;
export type TeamAction = (typeof TEAM_ACTIONS)[number]["key"];
export type TeamRole = "employee" | "manager" | "finance";
export const ROLE_LABEL: Record<TeamRole, string> = { employee: "Employee", manager: "Manager", finance: "Finance" };

/** Defaults shipped with the database; "Reset to default" restores these. */
export const DEFAULT_SWITCHES: Record<Exclude<TeamRole, "employee">, Record<TeamAction, boolean>> = {
  manager: { view_expenses: true, edit_expenses: false, delete_expenses: false, change_category: false, approve: false, view_receipts: true, view_company_tax: false, edit_budgets: false },
  finance: { view_expenses: true, edit_expenses: false, delete_expenses: false, change_category: false, approve: false, view_receipts: true, view_company_tax: true, edit_budgets: true },
};

export interface Switch { role: TeamRole; action: TeamAction; allowed: boolean }

/** Whether a role may do an action; company tax is finance-only regardless of switches. */
export function allowed(switches: Switch[], role: TeamRole | null, action: TeamAction): boolean {
  if (!role || role === "employee") return false;
  if (action === "view_company_tax" && role !== "finance") return false;
  return switches.some((s) => s.role === role && s.action === action && s.allowed);
}

/** Switches that differ from the shipped defaults (shown as "changed"). */
export function changedFromDefault(switches: Switch[]): Switch[] {
  return switches.filter((s) => s.role !== "employee" && DEFAULT_SWITCHES[s.role][s.action] !== s.allowed);
}

export interface CompanyTaxCsvRow { company: string; owner: string; kind: string; fy: string; bookProfit?: number | undefined; accumulatedProfits?: number | undefined; ownershipPct?: number | undefined }

/** CSV for the Company tax (all) section: one row per company and tax year; blank for figures not entered.
 *  Every row repeats the export date and the year filter the export was taken with, so a shared file stays identifiable. */
export function companyTaxCsv(rows: CompanyTaxCsvRow[], meta: { exportedOn: string; selectedYear: string }): string {
  const cell = (v: unknown) => { const s = v === undefined || v === null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = ["Company,Owner,Kind,Tax year,Book profit,Past profits,Owner share %,Exported on,Selected year"];
  for (const r of rows) lines.push([r.company, r.owner, r.kind, r.fy, r.bookProfit, r.accumulatedProfits, r.ownershipPct, meta.exportedOn, meta.selectedYear].map(cell).join(","));
  return lines.join("\n");
}

export function useTeamAccess(userId: string | undefined) {
  return useQuery({
    queryKey: ["team-access", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const [r, a, p] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId!).limit(1).maybeSingle(),
        supabase.from("app_admins").select("user_id").eq("user_id", userId!).maybeSingle(),
        supabase.from("role_permissions").select("role, action, allowed"),
      ]);
      return { role: (r.data?.role ?? null) as TeamRole | null, admin: !!a.data, switches: (p.data ?? []) as Switch[] };
    },
  });
}
