import { Briefcase, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { SCOPE_LABEL, type Scope } from "@/lib/expenses";

export function ScopeBadge({ scope, className }: { scope: Scope; className?: string }) {
  const Icon = scope === "business" ? Briefcase : Home;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
      scope === "business" ? "bg-primary text-primary-foreground" : "bg-accent/50 text-accent-foreground", className)}>
      <Icon className="h-3 w-3" />{SCOPE_LABEL[scope]}
    </span>
  );
}

/** Two-option segmented switch: Personal | Business */
export function ScopeToggle({ value, onChange, size = "md" }: { value: Scope; onChange: (s: Scope) => void; size?: "sm" | "md" }) {
  return (
    <div role="radiogroup" aria-label="Workspace" className={cn("inline-grid grid-cols-2 sm:grid-cols-4 rounded-2xl bg-secondary p-1", size === "sm" ? "text-xs" : "text-sm")}>
      {SCOPES.map((s) => {
        const Icon = s === "business" ? Briefcase : Home;
        return (
          <button key={s} type="button" role="radio" aria-checked={value === s} onClick={() => onChange(s)}
            className={cn("flex items-center justify-center gap-1.5 rounded-xl font-semibold transition", size === "sm" ? "px-2.5 py-1" : "px-4 py-2",
              value === s ? (s === "business" ? "bg-primary text-primary-foreground shadow-float" : "bg-card text-foreground shadow-sm") : "text-muted-foreground")}>
            <Icon className="h-4 w-4" />{SCOPE_LABEL[s]}
          </button>
        );
      })}
    </div>
  );
}
