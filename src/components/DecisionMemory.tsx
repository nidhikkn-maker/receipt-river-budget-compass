import { useState } from "react";
import { toast } from "sonner";
import { Card, Row } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { money } from "@/lib/expenses";
import { addMonths } from "@/lib/planning";
import { useStore } from "@/lib/store";
import { todayISO } from "@/lib/use-position";
import { decisionState, memorySummary, validateDecision, type DecisionMemory as D, type DecisionState } from "@/lib/memory";

const LABEL: Record<DecisionState, string> = { waiting: "Waiting for review", due: "Review now", better: "Better than expected", as_expected: "As expected", worse: "Worse than expected" };

export function DecisionMemory() {
  const { preferences, savePreferences } = useStore();
  const today = todayISO();
  const list = preferences.decisions;
  const [f, setF] = useState({ title: "", reason: "", expected: 0, reviewOn: addMonths(today, 3) });
  const [actuals, setActuals] = useState<Record<string, { actual: string; lesson: string }>>({});
  const [busy, setBusy] = useState(false);
  const save = async (next: D[]) => { setBusy(true); try { await savePreferences({ ...preferences, decisions: next }); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } };
  const add = async () => {
    const item = { id: crypto.randomUUID(), title: f.title.trim(), decidedOn: today, reason: f.reason.trim(), expected: f.expected, reviewOn: f.reviewOn, actual: null, lesson: "", reviewedAt: null };
    try { validateDecision(item); } catch (e) { toast.error((e as Error).message); return; }
    await save([...list, item]); setF({ ...f, title: "", reason: "", expected: 0 }); toast.success("Decision remembered");
  };
  const review = async (id: string) => {
    const a = actuals[id]; const n = Number(a?.actual);
    if (!a || a.actual === "" || !Number.isFinite(n)) { toast.error("Enter what actually happened"); return; }
    await save(list.map((d) => (d.id === id ? { ...d, actual: n, lesson: (a.lesson ?? "").slice(0, 500), reviewedAt: new Date().toISOString() } : d)));
  };
  const s = memorySummary(list);
  const sorted = [...list].sort((a, b) => b.decidedOn.localeCompare(a.decidedOn));
  return (
    <>
      <Card title="Remember a money decision">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label>What did you decide?</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Switched to a cheaper phone plan" /></div>
          <div className="sm:col-span-2"><Label>Why?</Label><Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></div>
          <div><Label>Expected effect per month (₹, minus for a cost)</Label><Input type="number" value={f.expected || ""} onChange={(e) => setF({ ...f, expected: Number(e.target.value) || 0 })} /></div>
          <div><Label>Check back on</Label><Input type="date" value={f.reviewOn} onChange={(e) => setF({ ...f, reviewOn: e.target.value })} /></div>
        </div>
        <Button className="mt-3" disabled={busy} onClick={add}>Remember it</Button>
      </Card>
      {s.reviewed > 0 && <Card title="How your decisions turned out"><Row label="Reviewed" value={s.reviewed} /><Row label="Expected per month" value={money(s.expectedTotal)} /><Row label="Actual per month" value={money(s.actualTotal)} tone={s.actualTotal >= s.expectedTotal ? "good" : "bad"} /></Card>}
      {sorted.length > 0 && <Card title="Decisions">
        {sorted.map((d) => {
          const st = decisionState(d, today);
          return (
            <div key={d.id} className="border-b py-3 last:border-0">
              <div className="flex justify-between gap-3"><p className="font-semibold">{d.title}</p><span className={`text-xs ${st === "worse" || st === "due" ? "text-destructive" : "text-muted-foreground"}`}>{LABEL[st]}</span></div>
              <p className="text-xs text-muted-foreground">Decided {d.decidedOn}{d.reason ? ` · ${d.reason}` : ""} · expected {money(d.expected)}/month{d.actual != null ? ` · actual ${money(d.actual)}/month` : ` · review on ${d.reviewOn}`}</p>
              {d.lesson && <p className="mt-1 text-sm italic">“{d.lesson}”</p>}
              {st === "due" && <div className="mt-2 grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
                <Input aria-label="Actual effect per month" type="number" placeholder="Actual ₹/month" value={actuals[d.id]?.actual ?? ""} onChange={(e) => setActuals({ ...actuals, [d.id]: { lesson: actuals[d.id]?.lesson ?? "", actual: e.target.value } })} />
                <Input aria-label="What you learned" placeholder="What you learned (optional)" value={actuals[d.id]?.lesson ?? ""} onChange={(e) => setActuals({ ...actuals, [d.id]: { actual: actuals[d.id]?.actual ?? "", lesson: e.target.value } })} />
                <Button size="sm" disabled={busy} onClick={() => void review(d.id)}>Save review</Button>
              </div>}
            </div>
          );
        })}
      </Card>}
    </>
  );
}
