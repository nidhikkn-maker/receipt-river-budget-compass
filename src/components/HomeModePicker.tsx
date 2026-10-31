import { useStore } from "@/lib/store";
import { applyHomeMode, HOME_MODE_LABEL } from "@/lib/preferences";

/** Daily / Executive / Minimal home arrangement switch (V5.0 §7.1). */
export function HomeModePicker({ compact = false }: { compact?: boolean }) {
  const { preferences, savePreferences } = useStore();
  const modes = Object.keys(HOME_MODE_LABEL) as (keyof typeof HOME_MODE_LABEL)[];
  return (
    <div role="radiogroup" aria-label="Home mode" className={"inline-flex rounded-xl bg-secondary p-0.5 " + (compact ? "text-xs" : "mb-3 text-sm")}>
      {modes.map((m) => (
        <button key={m} type="button" role="radio" aria-checked={preferences.homeMode === m}
          onClick={() => void savePreferences(applyHomeMode(preferences, m))}
          className={"rounded-lg px-3 py-1.5 font-medium transition " + (preferences.homeMode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>
          {HOME_MODE_LABEL[m]}
        </button>
      ))}
    </div>
  );
}
