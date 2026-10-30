import { cn } from "@/lib/utils";
import { STATUS_LABEL, type Status } from "@/lib/expenses";

const tone: Record<Status, string> = {
  pending_manager: "bg-warning/20 text-foreground",
  pending_finance: "bg-info/15 text-info",
  approved: "bg-primary/12 text-primary",
  reimbursed: "bg-success/15 text-success",
  rejected: "bg-destructive/12 text-destructive",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold", tone[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}

const STEPS = ["Submitted", "Manager", "Finance", "Paid"];
export function StageTrack({ status }: { status: Status }) {
  const reached = { pending_manager: 1, pending_finance: 2, approved: 3, reimbursed: 4, rejected: -1 }[status];
  return (
    <div className="flex items-center gap-1" aria-label={`Progress: ${STATUS_LABEL[status]}`}>
      {STEPS.map((s, i) => (
        <div key={s} title={s} className={cn("h-1.5 w-5 rounded-full", reached === -1 ? "bg-destructive/40" : i < reached ? "bg-primary" : "bg-border")} />
      ))}
    </div>
  );
}
