import { createFileRoute } from "@tanstack/react-router";
import { PageTitle, Stat } from "@/components/AppShell";
import { ExpenseTable } from "@/components/ExpenseTable";
import { canReview, money } from "@/lib/expenses";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/")({
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

  return (
    <>
      <PageTitle title={`Hello, ${user.name.split(" ")[0]}`} sub={`${user.department} · ${user.role === "manager" ? "Department manager" : user.role === "finance" ? "Finance" : "Employee"}`} />
      {user.role !== "employee" && (
        <div className="mb-8 rounded-md border border-accent bg-accent/30 p-4 text-sm">
          <strong>{queue.length}</strong> expense{queue.length === 1 ? "" : "s"} waiting for your {user.role === "manager" ? "review" : "sign-off"}. Open the Approvals tab to act.
        </div>
      )}
      <div className="mb-8 grid gap-4 sm:grid-cols-4">
        <Stat label="In review" value={money(sum(["pending_manager", "pending_finance"]))} />
        <Stat label="Approved, unpaid" value={money(sum(["approved"]))} />
        <Stat label="Reimbursed" value={money(sum(["reimbursed"]))} />
        <Stat label="Rejected" value={money(sum(["rejected"]))} />
      </div>
      <h2 className="mb-3 font-display text-xl">My expenses</h2>
      <ExpenseTable items={mine} showEmployee={false} empty="You haven't submitted any expenses yet." />
    </>
  );
}
