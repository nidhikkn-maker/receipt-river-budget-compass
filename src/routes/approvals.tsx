import { createFileRoute } from "@tanstack/react-router";
import { PageTitle } from "@/components/AppShell";
import { ExpenseTable } from "@/components/ExpenseTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { canReview } from "@/lib/expenses";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/approvals")({
  head: () => ({
    meta: [
      { title: "Approvals — Ledgerline" },
      { name: "description", content: "Review, approve and reimburse submitted expenses." },
      { property: "og:title", content: "Approvals — Ledgerline" },
      { property: "og:description", content: "Review, approve and reimburse submitted expenses." },
    ],
  }),
  component: Approvals,
});

function Approvals() {
  const { user, expenses } = useStore();
  if (user.role === "employee")
    return <PageTitle title="Approvals" sub="Switch to a manager or finance role to review expenses." />;
  const scope = user.role === "manager" ? expenses.filter((e) => e.department === user.department) : expenses;
  const queue = scope.filter((e) => canReview(user, e));
  const toPay = scope.filter((e) => e.status === "approved");
  return (
    <>
      <PageTitle
        title="Approvals"
        sub={user.role === "manager" ? `Step 1 of 2 — reviewing ${user.department} submissions.` : "Step 2 of 2 — finance sign-off and payouts."}
      />
      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue">Needs my action ({queue.length})</TabsTrigger>
          {user.role === "finance" && <TabsTrigger value="pay">Ready to reimburse ({toPay.length})</TabsTrigger>}
          <TabsTrigger value="all">All {user.role === "manager" ? user.department : ""} ({scope.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="queue" className="mt-4"><ExpenseTable items={queue} empty="Queue is clear." /></TabsContent>
        <TabsContent value="pay" className="mt-4"><ExpenseTable items={toPay} empty="Nothing awaiting payout." /></TabsContent>
        <TabsContent value="all" className="mt-4"><ExpenseTable items={scope} /></TabsContent>
      </Tabs>
    </>
  );
}
