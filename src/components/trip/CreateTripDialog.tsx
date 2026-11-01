import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CURRENCIES, SCOPE_LABEL } from "@/lib/expenses";
import { TRIP_TYPES, type TravelTrip, type TripType } from "@/lib/travel";
import { useStore } from "@/lib/store";
import { todayISO } from "@/lib/use-position";

const DRAFT_KEY = "ledgerline:trip-draft";
const sel = "h-11 w-full rounded-xl border bg-background px-2 text-sm";

interface TripDraft { name: string; destination: string; start: string; end: string; type: TripType; purpose: string; organisation: string; travellers: string; budget: string; currencies: string }
const emptyDraft = (today: string): TripDraft => ({ name: "", destination: "", start: today, end: today, type: "personal", purpose: "", organisation: "", travellers: "", budget: "", currencies: "INR" });

/** Focused Create Trip workflow: essentials first, optional details later, partial drafts survive navigation. No autoFocus — the keyboard stays closed until tapped. */
export function CreateTripDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { preferences: pr, savePreferences, transactions, members } = useStore();
  const navigate = useNavigate();
  const [form, setForm] = useState<TripDraft>(() => emptyDraft(todayISO()));
  const [more, setMore] = useState(false);
  const [saving, setSaving] = useState(false);

  // Restore a saved draft when the dialog opens.
  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) { setForm({ ...emptyDraft(todayISO()), ...JSON.parse(raw) }); setMore(true); }
    } catch { /* ignore a broken draft */ }
  }, [open]);

  const saveDraft = () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    toast.success("Draft saved — it will be here when you return");
    onOpenChange(false);
  };

  const create = async () => {
    const name = form.name.trim();
    if (!name) { toast.error("Name the trip"); return; }
    if (!form.start || !form.end) { toast.error("Choose the dates"); return; }
    if (form.end < form.start) { toast.error("End date is before start date"); return; }
    const budget = Number(form.budget) || 0;
    if (budget < 0) { toast.error("Budget can't be negative"); return; }
    const currencies = form.currencies.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
    if (currencies.some((c) => !(CURRENCIES as readonly string[]).includes(c))) { toast.error("Enter supported currency codes"); return; }
    if (pr.trips.some((t) => t.name.toLowerCase() === name.toLowerCase())) { toast.error("A trip with this name exists"); return; }
    if (transactions.some((e) => (e.tags ?? []).some((tag) => tag.toLowerCase() === `Trip: ${name}`.toLowerCase()))) { toast.error("This name is still attached to earlier entries; choose a new trip name"); return; }
    const t: TravelTrip = {
      id: crypto.randomUUID(), name, destination: form.destination.trim(), start: form.start, end: form.end, budget, currencies: [...new Set(currencies.length ? currencies : ["INR"])],
      type: form.type, travellers: form.travellers.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 8), bookings: [], itinerary: [], advances: [],
      ...(form.purpose.trim() ? { purpose: form.purpose.trim().slice(0, 200) } : {}),
      ...(form.organisation.trim() ? { organisation: form.organisation.trim().slice(0, 120) } : {}),
    };
    setSaving(true);
    try {
      await savePreferences({ ...pr, trips: [t, ...pr.trips] });
      localStorage.removeItem(DRAFT_KEY);
      toast.success("Trip created");
      onOpenChange(false);
      setForm(emptyDraft(todayISO()));
      void navigate({ to: "/trips/$tripId", params: { tripId: t.id } });
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg" aria-label="Create trip">
        <DialogHeader><DialogTitle>New trip</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label>Trip name</Label><Input className="h-11" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Dubai Dec 2026" /></div>
          <div><Label>Destination</Label><Input className="h-11" value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Start</Label><Input type="date" className="h-11" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></div>
            <div><Label>End</Label><Input type="date" className="h-11" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></div>
          </div>
          <div><Label>Primary workspace</Label>
            <select className={sel} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as TripType })}>
              {TRIP_TYPES.map((t) => <option key={t} value={t}>{t === "mixed" ? "Mixed purpose" : SCOPE_LABEL[t]}</option>)}
            </select>
          </div>
          <button type="button" className="text-left text-sm font-semibold text-primary" aria-expanded={more} onClick={() => setMore((m) => !m)}>
            {more ? "Hide optional details ▴" : "Add purpose, budget, travellers… ▾"}
          </button>
          {more && (
            <div className="grid gap-3">
              <div><Label>Purpose</Label><Input className="h-11" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} /></div>
              <div><Label>Organisation</Label><Input className="h-11" value={form.organisation} onChange={(e) => setForm({ ...form, organisation: e.target.value })} /></div>
              <div><Label>Travellers (comma separated)</Label><Input className="h-11" value={form.travellers} onChange={(e) => setForm({ ...form, travellers: e.target.value })} list="trip-members" />
                <datalist id="trip-members">{members.map((m) => <option key={m.id} value={m.name} />)}</datalist></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Budget (₹)</Label><Input type="number" className="h-11" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} /></div>
                <div><Label>Currencies</Label><Input className="h-11" value={form.currencies} onChange={(e) => setForm({ ...form, currencies: e.target.value })} /></div>
              </div>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={saveDraft}>Save draft</Button>
            <Button variant="gold" className="flex-1" loading={saving} onClick={create}>Create trip</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
