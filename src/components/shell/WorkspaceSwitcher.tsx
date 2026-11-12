import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useStore } from "@/lib/store";
import { ACTIVE_SCOPES, SCOPE_LABEL, type Scope } from "@/lib/expenses";
import { ProposedBadge } from "./States";

/** Label shown on the header chip for the active workspace. */
export function workspaceLabel(scope: "all" | Scope): string {
  return scope === "all" ? "All spaces" : SCOPE_LABEL[scope];
}

/**
 * Workspace switcher slot (B07). Real today: the saved Home workspace filter (All, Personal, Family, Business),
 * the same choice Spaces makes. Companies from Companies & years are listed but not yet selectable: a per-company
 * view does not exist in the data layer, so those rows are labelled Proposed instead of pretending to switch.
 */
export function WorkspaceSwitcher({ compact = false }: { compact?: boolean }) {
  const { preferences, savePreferences } = useStore();
  const [open, setOpen] = useState(false);
  const scope = preferences.homeScope;
  const companies = (preferences.entities ?? []).filter((e) => e.name.trim());
  const choose = async (next: "all" | Scope) => {
    setOpen(false);
    if (next === scope) return;
    try { await savePreferences({ ...preferences, homeScope: next }); }
    catch (e) { toast.error((e as Error).message || "Couldn't switch workspace. Nothing else changed."); }
  };
  const options: ("all" | Scope)[] = ["all", ...ACTIVE_SCOPES];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={compact ? "sf-workspace sf-workspace-compact" : "sf-workspace"} aria-label={`Workspace: ${workspaceLabel(scope)}. Change workspace`}>
        <span className="sf-workspace-label" title={workspaceLabel(scope)}>{workspaceLabel(scope)}</span><ChevronDown aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" className="sf-popover">
        <p className="sf-overline">Workspace</p>
        <ul role="listbox" aria-label="Choose workspace">
          {options.map((o) => (
            <li key={o} role="option" aria-selected={o === scope}>
              <button type="button" className="sf-menu-row" onClick={() => void choose(o)}>
                <span className="min-w-0 flex-1">{workspaceLabel(o)}</span>{o === scope && <Check aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
        {companies.length > 0 && <>
          <p className="sf-overline mt-3">Companies <ProposedBadge /></p>
          <ul aria-label="Companies (proposed)">
            {companies.map((c) => <li key={c.id} className="sf-menu-row sf-menu-row-disabled" aria-disabled="true"><span className="min-w-0 flex-1 truncate">{c.name}</span></li>)}
          </ul>
          <p className="sf-state-hint">A view for one company at a time is proposed. Today, company records sit under Business.</p>
        </>}
      </PopoverContent>
    </Popover>
  );
}
