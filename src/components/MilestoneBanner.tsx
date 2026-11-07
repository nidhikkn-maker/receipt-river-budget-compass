import { Link } from "@tanstack/react-router";
import { milestoneProgress } from "@/lib/intelligence";
import { useIntelligence } from "@/lib/use-intelligence";

/** Shows milestones the user asked to be told about once they are achieved. */
export function MilestoneBanner() {
  const { store, metrics, today } = useIntelligence();
  const done = store.preferences.milestones.filter((m) => m.notify && milestoneProgress(m, metrics, today).done);
  if (!done.length) return null;
  return (
    <Link to="/strategy" className="mb-4 block rounded-2xl border border-gold bg-gold-soft px-4 py-3 text-sm font-semibold text-gold-strong">
      🎉 Milestone reached: {done.map((m) => m.name).join(", ")}
    </Link>
  );
}
