import { useState } from "react";
import { toast } from "sonner";
import { Ban, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore } from "@/lib/store";
import { money } from "@/lib/expenses";
import { tripExpenses } from "@/lib/trip-actions";
import { cancelImpact, cancelTrip, deleteBlockers, restoreTrip, tripLinkedEntries } from "@/lib/trip-lifecycle";
import type { TravelTrip } from "@/lib/travel";

export function TripLifecycleActions({ trip, onDeleted }: { trip: TravelTrip; onDeleted: () => void }) {
  const { preferences: pr, savePreferences, transactions, manageTripExpenses } = useStore();
  const [mode, setMode] = useState<"cancel" | "delete" | null>(null);
  const [markBookings, setMarkBookings] = useState(true);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const impact = cancelImpact(trip, transactions);
  const blockers = deleteBlockers(trip, transactions);
  const linked = tripLinkedEntries(trip, transactions).length;

  const replace = (next: TravelTrip | null) => savePreferences({ ...pr, trips: next ? pr.trips.map((t) => (t.id === trip.id ? next : t)) : pr.trips.filter((t) => t.id !== trip.id) });

  const close = () => { setMode(null); setTyped(""); setError(null); };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {trip.cancelledAt ? (
          <Button variant="outline" size="sm" onClick={async () => { await replace(restoreTrip(trip)); toast.success("Trip restored"); }}><RotateCcw className="mr-1 h-4 w-4" />Restore trip</Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setMode("cancel")}><Ban className="mr-1 h-4 w-4" />Cancel trip</Button>
        )}
        <Button variant="outline" size="sm" className="text-destructive" onClick={() => setMode("delete")}><Trash2 className="mr-1 h-4 w-4" />Delete trip</Button>
      </div>

      <Dialog open={mode !== null} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent>
          {mode === "cancel" && (
            <>
              <DialogHeader>
                <DialogTitle>Cancel “{trip.name}”?</DialogTitle>
                <DialogDescription>The trip is marked Cancelled. No expenses or payments are removed, and you can restore it later.</DialogDescription>
              </DialogHeader>
              <ul className="space-y-1 text-sm">
                <li>{impact.linkedEntries} linked entr{impact.linkedEntries === 1 ? "y" : "ies"} stay as they are</li>
                <li>{impact.unpaidBookings} unpaid booking{impact.unpaidBookings === 1 ? "" : "s"}</li>
                {impact.outstandingAdvance > 0 && <li>Advance still open: {money(impact.outstandingAdvance)}</li>}
              </ul>
              {impact.unpaidBookings > 0 && (
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={markBookings} onCheckedChange={(v) => setMarkBookings(!!v)} />Also mark unpaid bookings as cancelled</label>
              )}
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <DialogFooter>
                <Button variant="ghost" onClick={close}>Keep trip</Button>
                <Button variant="destructive" onClick={async () => {
                  try { await replace(cancelTrip(trip, new Date().toISOString(), markBookings)); toast.success("Trip cancelled"); close(); }
                  catch (e) { setError(e instanceof Error ? e.message : "Could not cancel the trip"); }
                }}>Cancel trip</Button>
              </DialogFooter>
            </>
          )}
          {mode === "delete" && (
            <>
              <DialogHeader>
                <DialogTitle>Delete “{trip.name}”?</DialogTitle>
                <DialogDescription>The trip is removed. {linked} linked entr{linked === 1 ? "y is" : "ies are"} unlinked but stay in your records.</DialogDescription>
              </DialogHeader>
              {blockers.length > 0 ? (
                <div role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm">
                  <p className="font-medium">Can’t delete yet:</p>
                  <ul className="list-disc pl-5">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
                  <p className="mt-1 text-muted-foreground">Settle these first, or cancel the trip instead.</p>
                </div>
              ) : (
                <label className="block text-sm">Type the trip name to confirm
                  <Input className="mt-1" aria-label="Trip name" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={trip.name} />
                </label>
              )}
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <DialogFooter>
                <Button variant="ghost" onClick={close}>Keep trip</Button>
                <Button variant="destructive" disabled={blockers.length > 0 || typed.trim() !== trip.name.trim()} onClick={async () => {
                  try {
                    const rows = tripExpenses(trip, transactions);
                    if (rows.length) await manageTripExpenses(trip.id, rows, "unlink");
                    await replace(null);
                    toast.success("Trip deleted — entries kept");
                    close(); onDeleted();
                  } catch (e) { setError(e instanceof Error ? e.message : "Could not delete the trip"); }
                }}>Delete trip</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
