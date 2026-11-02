import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useStore } from "@/lib/store";
import { toast } from "sonner";
import type { SmartDefaultSettings } from "@/lib/preferences";

const ROWS: { key: keyof SmartDefaultSettings; label: string; hint: string }[] = [
  { key: "category", label: "Category", hint: "Start with the category you use most, or the one you use for that shop." },
  { key: "payment", label: "Account & payment method", hint: "Start with the account and UPI/card/cash you usually pay with." },
  { key: "workspace", label: "Workspace", hint: "Start in Personal, Family or Business based on your habits." },
];

/** On/off switches for New expense smart defaults. Choices you make on the form are never overwritten either way. */
export function SmartDefaultsSettings() {
  const { preferences: p, savePreferences } = useStore();
  const sd = p.smartDefaults ?? { category: true, payment: true, workspace: true };
  const set = async (key: keyof SmartDefaultSettings, on: boolean) => {
    try { await savePreferences({ ...p, smartDefaults: { ...sd, [key]: on } }); } catch { toast.error("Couldn't save — try again"); }
  };
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">New expense fills these from your last 40 expenses, giving recent ones more weight. Tap “Why these choices?” on the form to see which entries were used. Anything you pick yourself is never changed.</p>
      {ROWS.map((r) => (
        <div key={r.key} className="flex items-start justify-between gap-3">
          <div><Label htmlFor={`sd-${r.key}`}>{r.label}</Label><p className="text-xs text-muted-foreground">{r.hint}</p></div>
          <Switch id={`sd-${r.key}`} checked={sd[r.key]} onCheckedChange={(v) => void set(r.key, v)} />
        </div>
      ))}
    </div>
  );
}
