// @vitest-environment node
// Role-based access in isolated in-memory PostgreSQL: never contacts Lovable Cloud or touches real records.
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const db = new PGlite();
const ADMIN = "00000000-0000-0000-0000-00000000000a";
const EMP = "00000000-0000-0000-0000-000000000001"; // Engineering
const MGR = "00000000-0000-0000-0000-000000000002"; // manager, Engineering
const FIN = "00000000-0000-0000-0000-000000000003"; // finance, Accounts
const OTHER = "00000000-0000-0000-0000-000000000004"; // Sales

/** Run as a signed-in person with RLS applied. */
async function as<T = Record<string, unknown>>(uid: string, sql: string): Promise<T[]> {
  await db.exec(`RESET ROLE; SELECT set_config('app.uid','${uid}',false); SET ROLE authenticated;`);
  try { return (await db.query<T>(sql)).rows; } finally { await db.exec("RESET ROLE;"); }
}
const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

beforeAll(async () => {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.uid',true),'')::uuid $$;
    CREATE TABLE auth.users(id uuid primary key, email text);
    CREATE TYPE public.app_role AS ENUM ('employee','manager','finance');
    CREATE TABLE public.profiles(id uuid primary key, full_name text not null default '', department text not null default 'Engineering');
    CREATE TABLE public.user_roles(id uuid primary key default gen_random_uuid(), user_id uuid not null, role public.app_role not null);
    CREATE TABLE public.demo_sessions(owner_id uuid primary key);
    CREATE TABLE public.accounts(id uuid primary key, owner_id uuid);
    CREATE TABLE public.family_members(id uuid primary key, owner_id uuid);
    CREATE TABLE public.finance_preferences(owner_id uuid primary key, data jsonb not null default '{}');
    CREATE TABLE public.department_budgets(department text primary key, amount numeric not null);
    CREATE TABLE public.expenses(id text primary key, employee_id uuid not null, category text not null, amount numeric not null,
      account_id uuid, to_account_id uuid, member_id uuid, splits jsonb not null default '[]', receipts jsonb not null default '[]');
    CREATE TABLE storage.objects(bucket_id text, name text);
    GRANT USAGE ON SCHEMA public, auth, storage TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT SELECT ON storage.objects, auth.users TO authenticated;
    CREATE FUNCTION public.my_department() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT department FROM public.profiles WHERE id = auth.uid() $$;
    ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.finance_preferences ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.department_budgets ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Team members can view roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
    CREATE POLICY "Own prefs" ON public.finance_preferences FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
    CREATE POLICY "Own expenses: read" ON public.expenses FOR SELECT TO authenticated USING (employee_id = auth.uid());
    CREATE POLICY "Own expenses: edit" ON public.expenses FOR UPDATE TO authenticated USING (employee_id = auth.uid()) WITH CHECK (employee_id = auth.uid());
    CREATE POLICY "Own expenses: delete" ON public.expenses FOR DELETE TO authenticated USING (employee_id = auth.uid());
    CREATE POLICY "Own expenses: add" ON public.expenses FOR INSERT TO authenticated WITH CHECK (employee_id = auth.uid());
    CREATE POLICY "Expense linked records belong to owner" ON public.expenses AS RESTRICTIVE FOR ALL TO authenticated USING (employee_id = auth.uid()) WITH CHECK (true);
    CREATE POLICY "Read own receipts" ON storage.objects FOR SELECT TO authenticated USING (split_part(name,'/',1) = auth.uid()::text);
    CREATE POLICY "Anyone signed in can view budgets" ON public.department_budgets FOR SELECT TO authenticated USING (true);
    CREATE POLICY "Finance updates budgets" ON public.department_budgets FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
    CREATE POLICY "Finance inserts budgets" ON public.department_budgets FOR INSERT TO authenticated WITH CHECK (false);
    INSERT INTO auth.users VALUES ('${ADMIN}','a@x'),('${EMP}','e@x'),('${MGR}','m@x'),('${FIN}','f@x'),('${OTHER}','o@x');
    INSERT INTO public.profiles VALUES ('${ADMIN}','Admin','Board'),('${EMP}','Emp','Engineering'),('${MGR}','Mgr','Engineering'),('${FIN}','Fin','Accounts'),('${OTHER}','Other','Sales');
    INSERT INTO public.user_roles(user_id, role) VALUES ('${EMP}','employee'),('${MGR}','manager'),('${FIN}','finance'),('${OTHER}','employee');
    INSERT INTO public.expenses(id, employee_id, category, amount) VALUES ('e1','${EMP}','Travel',100),('m1','${MGR}','Meals',50),('f1','${FIN}','Office',70),('o1','${OTHER}','Travel',300);
    INSERT INTO storage.objects VALUES ('receipts','${EMP}/r.jpg'),('receipts','${OTHER}/r.jpg');
    INSERT INTO public.finance_preferences VALUES
      ('${EMP}', '{"entities":[{"id":"c1","name":"Emp Pvt Ltd","kind":"company"},{"id":"me","name":"Emp","kind":"individual"}],"books":{"entityTaxProfiles":[{"id":"t1","entityId":"c1","fy":"2025-26","ownershipPct":60}]},"personalTax":{"salary":1200000}}'),
      ('${OTHER}', '{}');
  `);
  await db.exec(readFileSync("drizzle/migrations/0066_role_access.sql", "utf8").replace(/--> statement-breakpoint/g, ""));
  await db.exec(readFileSync("drizzle/migrations/0086_role_permission_scope.sql", "utf8").replace(/--> statement-breakpoint/g, ""));
  await db.exec(`INSERT INTO public.app_admins(user_id) VALUES ('${ADMIN}')`);
}, 30000);
afterAll(async () => { await db.close(); });

describe("employee", () => {
  it("reads only their own expenses", async () => {
    expect(ids(await as<{ id: string }>(EMP, "SELECT id FROM public.expenses"))).toEqual(["e1"]);
  });
  it("cannot read another person's receipt", async () => {
    expect(await as(EMP, "SELECT name FROM storage.objects")).toEqual([{ name: `${EMP}/r.jpg` }]);
  });
  it("cannot read anyone's tax data", async () => {
    expect(await as(EMP, `SELECT owner_id FROM public.finance_preferences WHERE owner_id <> '${EMP}'`)).toEqual([]);
    await expect(as(EMP, "SELECT * FROM public.team_company_tax()")).rejects.toThrow(/not permitted/);
  });
});

describe("manager", () => {
  it("reads own and same-department expenses, not other departments", async () => {
    expect(ids(await as<{ id: string }>(MGR, "SELECT id FROM public.expenses"))).toEqual(["e1", "m1"]);
  });
  it("reads team receipts in their department only", async () => {
    expect(await as(MGR, "SELECT name FROM storage.objects")).toEqual([{ name: `${EMP}/r.jpg` }]);
  });
  it("cannot edit or delete team expenses by default", async () => {
    await as(MGR, "UPDATE public.expenses SET amount = 1 WHERE id = 'e1'");
    await as(MGR, "DELETE FROM public.expenses WHERE id = 'e1'");
    const r = await db.query<{ amount: string }>("SELECT amount FROM public.expenses WHERE id = 'e1'");
    expect(Number(r.rows[0]!.amount)).toBe(100);
  });
  it("cannot read tax data", async () => {
    await expect(as(MGR, "SELECT * FROM public.team_company_tax()")).rejects.toThrow(/not permitted/);
  });
  it("can edit a team expense only while the admin switch is on", async () => {
    await as(ADMIN, "SELECT public.admin_set_permission('manager','edit_expenses',true)");
    await as(MGR, "UPDATE public.expenses SET amount = 120 WHERE id = 'e1'");
    expect(Number((await db.query<{ amount: string }>("SELECT amount FROM public.expenses WHERE id='e1'")).rows[0]!.amount)).toBe(120);
    await expect(as(MGR, "UPDATE public.expenses SET category = 'Meals' WHERE id = 'e1'")).rejects.toThrow(/category/);
    await as(ADMIN, "SELECT public.admin_set_permission('manager','edit_expenses',false)");
    await as(MGR, "UPDATE public.expenses SET amount = 5 WHERE id = 'e1'");
    expect(Number((await db.query<{ amount: string }>("SELECT amount FROM public.expenses WHERE id='e1'")).rows[0]!.amount)).toBe(120);
  });
});

describe("finance", () => {
  it("reads every expense", async () => {
    expect(ids(await as<{ id: string }>(FIN, "SELECT id FROM public.expenses"))).toEqual(["e1", "f1", "m1", "o1"]);
  });
  it("cannot edit other people's expenses", async () => {
    await as(FIN, "UPDATE public.expenses SET amount = 1 WHERE id = 'o1'");
    expect(Number((await db.query<{ amount: string }>("SELECT amount FROM public.expenses WHERE id='o1'")).rows[0]!.amount)).toBe(300);
  });
  it("reads company tax figures but never personal figures", async () => {
    const rows = await as<{ owner_id: string; entities: { kind: string }[]; profiles: unknown[] }>(FIN, "SELECT owner_id, entities, profiles FROM public.team_company_tax()");
    const emp = rows.find((r) => r.owner_id === EMP)!;
    expect(emp.entities).toEqual([{ id: "c1", name: "Emp Pvt Ltd", kind: "company" }]);
    expect(emp.profiles).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain("1200000");
    expect(await as(FIN, `SELECT owner_id FROM public.finance_preferences WHERE owner_id <> '${FIN}'`)).toEqual([]);
  });
  it("loses company tax access when the admin switches it off", async () => {
    await as(ADMIN, "SELECT public.admin_set_permission('finance','view_company_tax',false)");
    await expect(as(FIN, "SELECT * FROM public.team_company_tax()")).rejects.toThrow(/not permitted/);
    await as(ADMIN, "SELECT public.admin_set_permission('finance','view_company_tax',true)");
  });
});

describe("role administration", () => {
  it("nobody but an admin can change roles or switches", async () => {
    await expect(as(EMP, `SELECT public.admin_set_member('${EMP}','finance',null)`)).rejects.toThrow(/Only an admin/);
    await expect(as(FIN, "SELECT public.admin_set_permission('finance','edit_expenses',true)")).rejects.toThrow(/Only an admin/);
    await expect(as(MGR, `INSERT INTO public.user_roles(user_id, role) VALUES ('${MGR}','finance')`)).rejects.toThrow();
    await expect(as(MGR, "UPDATE public.role_permissions SET allowed = true")).rejects.toThrow(/permission denied/);
    expect((await db.query<{ allowed: boolean }>("SELECT allowed FROM public.role_permissions WHERE role='manager' AND action='delete_expenses'")).rows[0]!.allowed).toBe(false);
  });
  it("an admin change is recorded in the history", async () => {
    await as(ADMIN, `SELECT public.admin_set_member('${OTHER}','manager','Sales')`);
    expect((await as<{ change: string }>(ADMIN, "SELECT change FROM public.role_permission_audit")).length).toBeGreaterThan(0);
    expect(await as(EMP, "SELECT change FROM public.role_permission_audit")).toEqual([]);
  });
});

describe("who can read the access switches", () => {
  const switches = (uid: string) => as<{ role: string; action: string; allowed: boolean }>(uid, "SELECT role, action, allowed FROM public.role_permissions");
  it("a manager sees only the manager row for each action", async () => {
    const rows = await switches(MGR);
    expect(rows).toHaveLength(8);
    expect(new Set(rows.map((r) => r.role))).toEqual(new Set(["manager"]));
    expect(rows.find((r) => r.action === "view_expenses")!.allowed).toBe(true);
    expect(rows.find((r) => r.action === "view_company_tax")!.allowed).toBe(false);
  });
  it("finance sees only the finance rows", async () => {
    const rows = await switches(FIN);
    expect(rows).toHaveLength(8);
    expect(new Set(rows.map((r) => r.role))).toEqual(new Set(["finance"]));
    expect(rows.find((r) => r.action === "view_company_tax")!.allowed).toBe(true);
  });
  it("an employee sees only their own all-off rows", async () => {
    const rows = await switches(EMP);
    expect(rows).toHaveLength(8);
    expect(new Set(rows.map((r) => r.role))).toEqual(new Set(["employee"]));
    expect(rows.filter((r) => r.allowed)).toEqual([]);
  });
  it("an admin sees every role's rows", async () => {
    const rows = await switches(ADMIN);
    expect(rows).toHaveLength(24);
    expect(new Set(rows.map((r) => r.role))).toEqual(new Set(["employee", "manager", "finance"]));
  });
  it("someone with no role and no admin flag sees nothing", async () => {
    expect(await switches("00000000-0000-0000-0000-000000000009")).toEqual([]);
  });
});
