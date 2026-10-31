import { Check, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { useStore } from "@/lib/store";
import { DEFAULT_APPEARANCE, DEFAULT_THEME, THEME_FAMILIES, THEME_STYLES, type Appearance, type ThemeName } from "@/lib/themes";

const APPEARANCES: { value: Appearance; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Follow system" },
];

/** Miniature UI preview built from the theme's four identity colours. */
function Swatch({ colors, selected }: { colors: [string, string, string, string]; selected: boolean }) {
  const [bg, card, primary, accent] = colors;
  return (
    <div className={"relative h-20 overflow-hidden rounded-2xl border-2 transition " + (selected ? "border-gold" : "border-border")} style={{ backgroundColor: bg }}>
      <div className="absolute left-2 right-2 top-2 h-2.5 rounded-full" style={{ backgroundColor: primary }} />
      <div className="absolute bottom-2 left-2 right-8 top-6 rounded-lg border border-black/5" style={{ backgroundColor: card }}>
        <div className="mx-2 mt-2 h-1.5 w-2/3 rounded-full" style={{ backgroundColor: primary, opacity: 0.55 }} />
        <div className="mx-2 mt-1.5 h-1.5 w-1/2 rounded-full" style={{ backgroundColor: primary, opacity: 0.3 }} />
      </div>
      <div className="absolute bottom-3.5 right-2.5 h-5 w-5 rounded-full shadow" style={{ backgroundColor: accent }} />
      {selected && <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gold text-gold-foreground"><Check className="h-3 w-3" /></span>}
    </div>
  );
}

export function AppearanceSettings() {
  const { preferences: p, savePreferences, loading } = useStore();
  if (loading) return null;
  const run = async (fn: () => Promise<void>) => { try { await fn(); toast.success("Appearance saved"); } catch (e) { toast.error((e as Error).message); } };
  const pick = (themeName: ThemeName) => run(() => savePreferences({ ...p, themeName }));
  const reset = () => run(() => savePreferences({ ...p, themeName: DEFAULT_THEME, theme: DEFAULT_APPEARANCE }));

  return (
    <section className="mb-8" aria-label="Appearance">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-bold">Appearance</h2>
        <Button variant="outline" size="sm" onClick={reset}><RotateCcw className="h-4 w-4" />Restore default</Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Light or dark">
        {APPEARANCES.map((a) => (
          <Button key={a.value} size="sm" variant={p.theme === a.value ? "default" : "outline"} aria-pressed={p.theme === a.value}
            onClick={() => run(() => savePreferences({ ...p, theme: a.value }))}>{a.label}</Button>
        ))}
      </div>

      <div className="space-y-5">
        {THEME_FAMILIES.map((family) => {
          const styles = THEME_STYLES.filter((t) => t.family === family);
          return (
            <div key={family}>
              <div className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{family}</div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {styles.map((t) => (
                  <button key={t.name} type="button" onClick={() => pick(t.name)} aria-pressed={p.themeName === t.name}
                    className="group rounded-3xl border bg-card p-3 text-left transition hover:shadow-float">
                    <Swatch colors={t.swatch} selected={p.themeName === t.name} />
                    <div className="mt-2 text-sm font-bold">{t.label}{t.darkFirst ? " · dark" : ""}</div>
                    <div className="text-xs text-muted-foreground">{t.hint}</div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">Themes change only how Ledgerline looks — your records, figures and permissions are untouched. Your choice syncs across signed-in devices.</p>
    </section>
  );
}
