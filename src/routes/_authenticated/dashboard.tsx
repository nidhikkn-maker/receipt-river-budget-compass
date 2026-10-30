import { createFileRoute, Link } from "@tanstack/react-router";
import { Stat } from "@/components/AppShell";
import { ExpenseTable } from "@/components/ExpenseTable";
import { canReview, money } from "@/lib/expenses";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Overview — Ledgerline Expenses" },
      { name: "description", content: "Track team expenses, approvals and reimbursements in one ledger." },
      { property: "og:title", content: "Overview — Ledgerline Expenses" },
      { property: "og:description", content: "Track team expenses, approvals and reimbursements in one ledger." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Overview,
});

function Overview() {
  const { user, expenses } = useStore();
  const mine = expenses.filter((e) => e.employeeId === user.id);
  const sum = (s: string[]) => mine.filter((e) => s.includes(e.status)).reduce((a, e) => a + e.amount, 0);
  const queue = expenses.filter((e) => canReview(user, e));

  const inReview = sum(["pending_manager", "pending_finance"]);
  const owed = sum(["approved"]);
  return (
    <>
      <section className="relative mb-6 overflow-hidden rounded-3xl bg-hero p-6 text-primary-foreground shadow-float sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full border-[28px] border-primary-foreground/10" />
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] opacity-80">{user.department} · {user.role === "manager" ? "Department manager" : user.role === "finance" ? "Finance" : "Employee"}</div>
        <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight sm:text-5xl">Hi {user.name.split(" ")[0]}.</h1>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:max-w-lg">
          <div><div className="text-xs opacity-80">In review</div><div className="font-mono text-2xl">{money(inReview)}</div></div>
          <div><div className="text-xs opacity-80">Owed to you</div><div className="font-mono text-2xl">{money(owed)}</div></div>
        </div>
        {user.role !== "employee" && queue.length > 0 && (
          <Link to="/approvals" className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary-foreground px-4 py-2 text-sm font-semibold text-primary">
            {queue.length} waiting for your {user.role === "manager" ? "review" : "sign-off"} →
          </Link>
        )}
      </section>
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-2">
        <Stat label="Reimbursed" value={money(sum(["reimbursed"]))} />
        <Stat label="Rejected" value={money(sum(["rejected"]))} />
      </div>
      <h2 className="mb-3 font-display text-xl font-bold">My expenses</h2>
      <ExpenseTable items={mine} showEmployee={false} empty="You haven't submitted any expenses yet." />
    </>
  );
}
