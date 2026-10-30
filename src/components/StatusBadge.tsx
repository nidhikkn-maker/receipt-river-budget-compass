import { cn } from "@/lib/utils";
import { STATUS_LABEL, type Status } from "@/lib/expenses";

const tone: Record<Status, string> = {
  pending_manager: "bg-warning/15 text-foreground border-warning/50",
  pending_finance: "bg-info/15 text-info border-info/40",
  approved: "bg-primary/10 text-primary border-primary/40",
  reimbursed: "bg-success/15 text-success border-success/40",
  rejected: "bg-destructive/10 text-destructive border-destructive/40",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={cn("inline-flex items-center rounded-sm border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide", tone[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}

const STEPS = ["Submitted", "Manager", "Finance", "Paid"];
export function StageTrack({ status }: { status: Status }) {
  const reached = { pending_manager: 1, pending_finance: 2, approved: 3, reimbursed: 4, rejected: -1 }[status];
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <div
            title={s}
            className={cn(
              "h-1.5 w-6 rounded-full",
              reached === -1 ? "bg-destructive/40" : i < reached ? "bg-primary" : "bg-border",
            )}
          />
        </div>
      ))}
    </div>
  );
}
