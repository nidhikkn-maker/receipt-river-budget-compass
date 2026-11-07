import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { clearSamples, loadSamples, summarise, type PerfSample } from "@/lib/perf-check";

/** Shows how fast main pages opened on this device (measured locally, never uploaded). */
export function SpeedCheck() {
  const [list, setList] = useState<PerfSample[]>([]);
  useEffect(() => setList(loadSamples()), []);
  const rows = summarise(list);
  const sec = (ms: number | null) => (ms === null ? "—" : `${(ms / 1000).toFixed(1)} s`);
  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">Open each page a few times on this phone, then come back here. Timings stay on this device.</p>
      <ul className="divide-y rounded-lg border">
        {rows.map((r) => (
          <li key={r.path} className="flex items-center justify-between gap-2 p-3">
            <div><p className="font-medium">{r.label}</p><p className="text-xs text-muted-foreground">Target {sec(r.targetMs)} · {r.count} opens · slowest typical {sec(r.p90)}</p></div>
            <div className="text-right"><p className="font-semibold">{sec(r.median)}</p>
              <p className={r.result === "slow" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{r.result === "pass" ? "Within target" : r.result === "slow" ? "Slower than target" : "Need 3 opens"}</p></div>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setList(loadSamples())}>Refresh</Button>
        <Button variant="ghost" size="sm" onClick={() => { clearSamples(); setList([]); }}>Clear timings</Button>
      </div>
    </div>
  );
}
