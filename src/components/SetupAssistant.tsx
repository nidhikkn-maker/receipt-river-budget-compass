// Optional guided setup (Version 4.9). Every step is skippable; finishing or dismissing saves
// "done" to owner preferences so it never reappears on its own, and Settings can reopen it.
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from 'sonner';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AccountForm } from "@/components/AccountForm";
import { useStore } from "@/lib/store";
import { SETUP_LABEL, setupStatus } from "@/lib/setup-status";

const STEPS = [
  { key: "workspaces", title: "Primary workspace", body: "Personal is always available. Business and Official appear as soon as you record entries for them." },
  { key: "accounts", title: "Bank or cash accounts", body: "Add the accounts you pay from.", form: ["savings", "current", "cash", "wallet"] as const },
  { key: "cards", title: "Credit cards", body: "Add cards with limit and due day so reminders and utilisation work.", form: ["credit_card"] as const },
  { key: "methods", title: "Payment methods", body: "Link UPI IDs and cards to the accounts they draw from.", to: "/payment-methods" },
  { key: "categories", title: "Review categories", body: "Rename, add or archive categories once — every screen uses them.", to: "/settings", hash: "finance" },
  { key: "entry", title: "Default expense entry", body: "Choose the default currency and entry preferences.", to: "/settings", hash: "finance" },
  { key: "notifications", title: "Notifications", body: "Choose reminders and device alerts.", to: "/settings", hash: "notifications" },
] as const;

export function SetupAssistant({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { preferences, savePreferences, accounts, expenses } = useStore();
  const [i, setI] = useState(0);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setI(0); }, [open]);
  const status = useMemo(() => Object.fromEntries(setupStatus({ accounts, expenses, preferences }).map((s) => [s.key, s.state])), [accounts, expenses, preferences]);
  const finish = async () => {
    if (saving) return;
    setSaving(true);
    try { if (preferences.setupAssistant !== 'done') await savePreferences({ ...preferences, setupAssistant: 'done' }); onOpenChange(false); }
    catch { toast.error('Setup completion could not be saved. Retry; your financial records are unchanged.'); }
    finally { setSaving(false); }
  };
  const step = STEPS[i];
  if (!step) return null;
  const st = step.key === "cards" ? (accounts.some((a) => a.kind === "credit_card" && !a.archived) ? "ready" : "optional") : status[step.key];
  const jump = () => { onOpenChange(false); if ("hash" in step) setTimeout(() => document.getElementById(step.hash)?.scrollIntoView({ behavior: "smooth" }), 50); };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : void finish())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Step {i + 1} of {STEPS.length + 1}: {i < STEPS.length ? step.title : "Done"}</DialogTitle>
          <DialogDescription>{step.body}{st && <span className="mt-1 block font-semibold">Current status: {SETUP_LABEL[st as keyof typeof SETUP_LABEL]}</span>}</DialogDescription>
        </DialogHeader>
        {"form" in step && <AccountForm compact kinds={step.form} />}
        {"to" in step && <Button asChild variant="secondary"><Link to={step.to} onClick={jump}>Open {step.title.toLowerCase()}</Link></Button>}
        <DialogFooter className="gap-2">
          {i > 0 && <Button disabled={saving} variant="ghost" onClick={() => setI(i - 1)}>Back</Button>}
          {i < STEPS.length - 1 ? <><Button disabled={saving} variant="outline" onClick={() => setI(i + 1)}>Skip</Button><Button disabled={saving} onClick={() => setI(i + 1)}>Next</Button></>
            : <Button loading={saving} onClick={finish}>Complete setup</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
