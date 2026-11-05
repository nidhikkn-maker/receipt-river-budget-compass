import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { dropEntity, linkAccounts, mergeEntity, needsDetails, unlinkAccount } from "@/lib/books/entity-accounts";
import { emptyBooks } from "@/lib/books/types";
import { confirmAction } from "@/lib/confirm";
import { CompanyTaxProfile } from "@/components/books/CompanyTaxProfile";
import { dropEntityYears, mergeEntityYears } from "@/lib/books/entity-tax-profile";
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
const blank = (): EntityProfile => ({ id: crypto.randomUUID(), name: "", kind: "company", pan: "", gstins: [], booksFrom: fyOf(new Date().toISOString().slice(0, 10)) });

function Entities() {
  const { preferences, savePreferences, transactions, documents, accounts } = useStore();
  const books = preferences.books ?? emptyBooks();
  const links = books.entityAccounts ?? {};
  const [picking, setPicking] = useState<string | null>(null);
  const [pick, setPick] = useState<string[]>([]);
  const saveLinks = async (entityAccounts: Record<string, string[]>, entities = list, msg = "Saved") => { await savePreferences({ ...preferences, entities, books: { ...books, entityAccounts } }); toast.success(msg); };
  const accName = (id: string) => accounts.find((a) => a.id === id)?.name ?? "Removed account";
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
    if (!edit) return;
    const fixed = { ...edit, name: edit.name.trim() || "Unnamed company" };
    const isNew = !list.some((x) => x.id === edit.id);
    const next = isNew ? [...list, fixed] : list.map((x) => (x.id === edit.id ? fixed : x));
    await savePreferences({ ...preferences, entities: next });
    if (isNew) window.__lovableEvents?.track?.("project.company_created", { source: "companies_page", kind: fixed.kind });
    toast.success("Profile saved"); setEdit(null);
  };
  const remove = async (id: string) => {
    if (!(await confirmAction({ title: "Delete this profile?", message: "Linked accounts are unlinked, not deleted. Entries stay as they are.", confirmLabel: "Delete" }))) return;
    await savePreferences({ ...preferences, entities: list.filter((x) => x.id !== id), books: { ...books, entityAccounts: dropEntity(links, id), entityTaxProfiles: dropEntityYears(books.entityTaxProfiles, id) } }); toast.success("Profile deleted"); setEdit(null);
  };
  const merge = async (from: string, into: string) => {
    if (!into || !(await confirmAction({ title: "Merge companies?", message: "Accounts move to the chosen company and this profile is removed. Entries are not changed.", confirmLabel: "Merge" }))) return;
    await savePreferences({ ...preferences, entities: list.filter((x) => x.id !== from), books: { ...books, entityAccounts: mergeEntity(links, from, into), entityTaxProfiles: mergeEntityYears(books.entityTaxProfiles, from, into) } }); toast.success("Merged");
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <PageTitle title="Companies & years" sub="Each company or person you keep books for, and which past years are on record." />
      {!edit && <div className="flex flex-wrap gap-2"><Link to="/statements" search={{ context: "entity" }} className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Add from documents</Link><Button variant="outline" onClick={() => { setEdit(blank()); setGst(""); }}>Add manually</Button><Link to="/company-spending" className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-semibold">Compare spending</Link></div>}
      {!edit && <p className="text-xs text-muted-foreground">Upload the incorporation certificate, PAN, GST certificate, MoA/AoA or partnership/LLP/trust deed — the profile is read for you to review. Re-uploading matches by PAN, CIN or GSTIN, so no duplicates.</p>}

      {edit && (
        <div className="space-y-3 rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Every field is optional — fill in what you have now and the rest later.</p>
          <Input placeholder="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as EntityKind })}>
            {Object.entries(ENTITY_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <div>
            <Input placeholder="PAN" value={edit.pan} onChange={(e) => setEdit({ ...edit, pan: e.target.value.toUpperCase() })} />
            {edit.pan && panErr && <p className="mt-1 text-xs text-muted-foreground">Check: {panErr} (you can still save)</p>}
          </div>
          {(edit.kind === "company" || edit.kind === "llp") && <Input placeholder={edit.kind === "llp" ? "LLPIN" : "CIN"} value={edit.regNo ?? ""} onChange={(e) => setEdit({ ...edit, regNo: e.target.value.toUpperCase() })} />}
          <div className="space-y-1">
            <p className="text-sm font-semibold">GST registrations</p>
            {edit.gstins.map((g, i) => (
              <div key={g} className="flex items-center justify-between gap-2 text-sm">
                <span className="font-mono">{g}</span>
                {gstErrs[i] && <span className="text-xs text-muted-foreground">Check: {gstErrs[i]}</span>}
                <Button size="sm" variant="ghost" onClick={() => setEdit({ ...edit, gstins: edit.gstins.filter((x) => x !== g) })}>Remove</Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input placeholder="Add GSTIN" value={gst} onChange={(e) => setGst(e.target.value.toUpperCase())} />
              <Button variant="outline" disabled={!gst.trim()} onClick={() => { if (!edit.gstins.includes(gst)) setEdit({ ...edit, gstins: [...edit.gstins, gst] }); setGst(""); }}>Add</Button>
            </div>
          </div>
          <label className="block text-sm">Books start from financial year
            <Input className="mt-1" placeholder="2024-25" value={edit.booksFrom} onChange={(e) => setEdit({ ...edit, booksFrom: e.target.value })} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button onClick={save}>Save</Button>
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
              <p className="font-semibold">{p.name}{needsDetails(p) && <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Details to fill</span>}</p>
              <p className="text-xs text-muted-foreground">{ENTITY_KINDS[p.kind].label}{p.pan ? ` · PAN ${p.pan}` : ""}{p.regNo ? ` · ${p.regNo}` : ""}{p.gstins.length ? ` · ${p.gstins.length} GSTIN` : ""}{p.incorporatedOn ? ` · since ${p.incorporatedOn}` : ""}</p>
              {p.address && <p className="text-xs text-muted-foreground">{p.address}</p>}
              {!!p.people?.length && <p className="text-xs text-muted-foreground">{p.people.map((x) => `${x.name} (${x.role})`).join(", ")}</p>}
              {!!p.shareholding?.length && <p className="text-xs text-muted-foreground">Shareholding: {p.shareholding.map((x) => `${x.name} ${x.pct}%`).join(", ")}</p>}
            </div>
            <div className="flex shrink-0 gap-1"><Button size="sm" variant="outline" onClick={() => setEdit(p)}>Edit</Button><Button size="sm" variant="ghost" className="text-destructive" onClick={() => void remove(p.id)}>Delete</Button></div>
          </div>
          {p.kind !== "individual" && p.kind !== "huf" && <CompanyTaxProfile entity={p} />}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground">Bank accounts & cards ({(links[p.id] ?? []).length})</p>
            {(links[p.id] ?? []).map((id) => (
              <div key={id} className="flex items-center justify-between gap-2 rounded-xl bg-secondary/50 px-3 py-1.5 text-sm">
                <span className="truncate">{accName(id)}</span>
                <div className="flex shrink-0 items-center gap-1">
                  <select aria-label="Move to" className="rounded-md border bg-background px-2 py-1 text-xs" value="" onChange={(e) => { const to = e.target.value || null; void saveLinks(linkAccounts(links, to, [id]), list, "Moved").then(() => window.__lovableEvents?.track?.("project.account_company_linked", { action: to ? "move" : "unlink", source: "companies_page" })); }}>
                    <option value="">Move to…</option>
                    {list.filter((x) => x.id !== p.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                  <Button size="sm" variant="ghost" onClick={() => void saveLinks(unlinkAccount(links, id), list, "Unlinked").then(() => window.__lovableEvents?.track?.("project.account_company_linked", { action: "unlink", source: "companies_page" }))}>Unlink</Button>
                </div>
              </div>
            ))}
            {picking === p.id ? (
              <div className="space-y-1 rounded-xl border p-2">
                {accounts.filter((a) => !a.archived && !(links[p.id] ?? []).includes(a.id)).map((a) => { const cur = Object.entries(links).find(([, ids]) => ids.includes(a.id))?.[0]; const curName = cur ? list.find((x) => x.id === cur)?.name ?? "another company" : "Personal"; return (
                  <label key={a.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pick.includes(a.id)} onChange={(e) => setPick(e.target.checked ? [...pick, a.id] : pick.filter((x) => x !== a.id))} />{a.name}<span className="text-xs text-muted-foreground">· now {curName}</span></label>
                ); })}
                <div className="flex gap-2"><Button size="sm" disabled={!pick.length} onClick={() => void saveLinks(linkAccounts(links, p.id, pick), list, "Linked").then(() => { window.__lovableEvents?.track?.("project.account_company_linked", { action: "link", source: "companies_page" }); setPicking(null); setPick([]); })}>Link {pick.length || ""}</Button><Button size="sm" variant="ghost" onClick={() => { setPicking(null); setPick([]); }}>Cancel</Button></div>
              </div>
            ) : <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => { setPicking(p.id); setPick([]); }}>Link accounts</Button>
              {list.length > 1 && <select aria-label="Merge into" className="rounded-md border bg-background px-2 py-1 text-xs" value="" onChange={(e) => void merge(p.id, e.target.value)}><option value="">Merge into…</option>{list.filter((x) => x.id !== p.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}</div>}
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
