import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { ENTITY_KINDS, fyOf, gstinProblem, panProblem, yearStatuses, type EntityKind, type EntityProfile } from "@/lib/entities";

export const Route = createFileRoute("/_authenticated/entities")({
  head: () => ({ meta: [
    { title: "Companies & financial years — Ledgerline" },
    { name: "description", content: "Your companies and personal profiles with PAN, GSTIN and which past financial years are on record." },
    { property: "og:title", content: "Companies & financial years — Ledgerline" },
    { property: "og:description", content: "Your companies and personal profiles with PAN, GSTIN and which past financial years are on record." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Entities,
});

const STATE = { empty: "Nothing yet", started: "Partly on record", covered: "Entries + statement" } as const;
const blank = (): EntityProfile => ({ id: crypto.randomUUID(), name: "", kind: "individual", pan: "", gstins: [], booksFrom: fyOf(new Date().toISOString().slice(0, 10)) });

function Entities() {
  const { preferences, savePreferences, transactions, documents } = useStore();
  const list = preferences.entities ?? [];
  const [edit, setEdit] = useState<EntityProfile | null>(null);
  const [gst, setGst] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const dates = useMemo(() => ({
    entries: transactions.map((t) => t.date),
    statements: transactions.filter((t) => t.statementRef || t.reconciledAt).map((t) => t.date),
    docs: documents.map((d) => d.docDate ?? d.createdAt.slice(0, 10)),
  }), [transactions, documents]);

  const panErr = edit ? panProblem(edit.pan, edit.kind) : null;
  const gstErrs = edit ? edit.gstins.map((g) => gstinProblem(g, edit.pan)) : [];
  const save = async () => {
    if (!edit || !edit.name.trim() || panErr || gstErrs.some(Boolean)) return;
    const next = list.some((x) => x.id === edit.id) ? list.map((x) => (x.id === edit.id ? edit : x)) : [...list, edit];
    await savePreferences({ ...preferences, entities: next });
    toast.success("Profile saved"); setEdit(null);
  };
  const remove = async (id: string) => { await savePreferences({ ...preferences, entities: list.filter((x) => x.id !== id) }); setEdit(null); };

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <PageTitle title="Companies & years" sub="Each company or person you keep books for, and which past years are on record." />
      {!edit && <Button onClick={() => { setEdit(blank()); setGst(""); }}>Add company or person</Button>}

      {edit && (
        <div className="space-y-3 rounded-2xl border bg-card p-4">
          <Input placeholder="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as EntityKind })}>
            {Object.entries(ENTITY_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <div>
            <Input placeholder="PAN" value={edit.pan} onChange={(e) => setEdit({ ...edit, pan: e.target.value.toUpperCase() })} />
            {edit.pan && panErr && <p className="mt-1 text-xs text-destructive">{panErr}</p>}
          </div>
          {(edit.kind === "company" || edit.kind === "llp") && <Input placeholder={edit.kind === "llp" ? "LLPIN" : "CIN"} value={edit.regNo ?? ""} onChange={(e) => setEdit({ ...edit, regNo: e.target.value.toUpperCase() })} />}
          <div className="space-y-1">
            <p className="text-sm font-semibold">GST registrations</p>
            {edit.gstins.map((g, i) => (
              <div key={g} className="flex items-center justify-between gap-2 text-sm">
                <span className="font-mono">{g}</span>
                {gstErrs[i] && <span className="text-xs text-destructive">{gstErrs[i]}</span>}
                <Button size="sm" variant="ghost" onClick={() => setEdit({ ...edit, gstins: edit.gstins.filter((x) => x !== g) })}>Remove</Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input placeholder="Add GSTIN" value={gst} onChange={(e) => setGst(e.target.value.toUpperCase())} />
              <Button variant="outline" disabled={gst.length !== 15} onClick={() => { if (!edit.gstins.includes(gst)) setEdit({ ...edit, gstins: [...edit.gstins, gst] }); setGst(""); }}>Add</Button>
            </div>
          </div>
          <label className="block text-sm">Books start from financial year
            <Input className="mt-1" placeholder="2024-25" value={edit.booksFrom} onChange={(e) => setEdit({ ...edit, booksFrom: e.target.value })} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={!edit.name.trim() || !!panErr || gstErrs.some(Boolean) || !/^\d{4}-\d{2}$/.test(edit.booksFrom)}>Save</Button>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
            {list.some((x) => x.id === edit.id) && <Button variant="ghost" className="text-destructive" onClick={() => remove(edit.id)}>Delete profile</Button>}
          </div>
        </div>
      )}

      {list.length === 0 && !edit && <p className="text-sm text-muted-foreground">No profiles yet. Add yourself and each company to track PAN, GST and past years.</p>}
      {list.map((p) => (
        <div key={p.id} className="space-y-3 rounded-2xl border bg-card p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{p.name}</p>
              <p className="text-xs text-muted-foreground">{ENTITY_KINDS[p.kind].label} · PAN {p.pan}{p.regNo ? ` · ${p.regNo}` : ""}{p.gstins.length ? ` · ${p.gstins.length} GSTIN` : ""}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setEdit(p)}>Edit</Button>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground">Financial years on record</p>
            {yearStatuses(p.booksFrom, today, dates.entries, dates.statements, dates.docs).map((y) => (
              <div key={y.fy} className="flex items-center justify-between rounded-xl bg-secondary/50 px-3 py-1.5 text-sm">
                <span>FY {y.fy}</span>
                <span className="text-xs text-muted-foreground">{y.entries} entries · {y.statements} from statements · {y.documents} docs — <b className={y.state === "covered" ? "text-primary" : ""}>{STATE[y.state]}</b></span>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Counts come from your saved records; a year is never treated as complete without your accountant's confirmation.</p>
          </div>
        </div>
      ))}
    </div>
  );
}
