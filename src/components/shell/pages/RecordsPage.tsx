import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Building2, CircleCheck, CircleDot, Columns4, FileStack, Gem, House, ListChecks, Package, Plane, Plus, Rows3 } from "lucide-react";
import { ModuleDirectory } from "@/components/ModuleDirectory";
import { useStore } from "@/lib/store";
import { openSmartAdd } from "@/lib/smart-add-event";
import { usePosition } from "@/lib/use-position";
import { ModuleRow, PageHeader } from "../PageHeader";

const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/**
 * Records hub (capture 05). Every row opens an existing page. Reports sits here too, so on iPhone it is
 * two taps from Home (Records → Reports); the full page directory ("Every page") replaces today's More sheet.
 */
export function SignatureRecords() {
  const { documents, preferences, accounts, expenses } = useStore();
  const pos = usePosition(30);
  const [all, setAll] = useState(false);
  const assets = (preferences.assets ?? []).filter((a) => !a.soldOn);
  const properties = preferences.books?.properties ?? [];
  const investments = accounts.filter((a) => !a.archived && (a.kind === "investment" || a.kind === "fixed_deposit"));
  const companies = (preferences.entities ?? []).length;
  return (
    <div className="sf-page">
      <PageHeader overline="Your connected records" title="Everything in its place." description="Organised from your documents and statements. Jump between related items without entering anything twice." />
      <div className="sf-actions-row sf-actions-top">
        <button type="button" className="sf-btn sf-btn-deep" onClick={() => openSmartAdd("document")}><Plus aria-hidden />Add document</button>
        <Link to="/reports" className="sf-btn sf-btn-outline">View related reports</Link>
      </div>
      <div className="sf-module-grid">
        <ModuleRow to="/vault" icon={<Rows3 />} title="Document Repository" detail={documents.length ? `${n(documents.length, "document")} · originals linked to their records` : "Original evidence, linked to matching books and transactions"} />
        <ModuleRow to="/trips" icon={<Plane />} title="Travel Manager" detail={preferences.trips.length ? `${n(preferences.trips.length, "trip")} · itinerary kept apart from settlement` : "Itinerary separate from financial settlement and reimbursement"} />
        <ModuleRow to="/assets" icon={<Package />} title="Asset Manager" detail={assets.length ? `${n(assets.length, "asset")} · ownership, linked account and depreciation` : "Fixed asset registers, ownership, linked account and depreciation"} />
        <ModuleRow to="/assets" icon={<House />} title="Property Manager" detail={properties.length ? `${n(properties.length, "property", "properties")} · rent, taxes and documents` : "Ownership, location, rent, mortgage, taxes and associated assets"} />
        <ModuleRow to="/wealth" hash="investments" icon={<CircleDot />} title="Investment Manager" detail={investments.length ? `${n(investments.length, "account")} · dated prices and source proof` : "Demat imports, market prices, capital gains and source proof"} />
        <ModuleRow to="/claim-submission" icon={<CircleCheck />} title="Reimbursements" detail={pos.reimbursements.pendingCount ? `${n(pos.reimbursements.pendingCount, "claim")} open · linked receipts` : "Claim, approval, payment and linked receipts"} />
      </div>

      <h2 className="sf-overline sf-group-label">Also in Records</h2>
      <div className="sf-module-grid">
        <ModuleRow to="/statements" icon={<FileStack />} title="Statement Desk" detail="The one place to upload and check bank and card statements" />
        <ModuleRow to="/expenses" icon={<ListChecks />} title="Expenses & transactions" detail={expenses.length ? `${n(expenses.length, "expense")} · every entry with its source` : "Every entry with its source"} />
        <ModuleRow to="/entities" icon={<Building2 />} title="Companies & years" detail={companies ? `${n(companies, "company", "companies")} · PAN, GSTIN and years on record` : "Companies, PAN, GSTIN and financial years"} />
        <ModuleRow to="/reports" icon={<Columns4 />} title="Reports" detail="Spending insights, statements, exports and evidence packs" />
      </div>

      <section className="sf-section" aria-labelledby="sf-every-title">
        <div className="sf-section-head"><h2 id="sf-every-title">Every page</h2><button type="button" className="sf-link" aria-expanded={all} onClick={() => setAll((v) => !v)}>{all ? "Hide" : "Show all"}</button></div>
        {all ? <ModuleDirectory onNavigate={() => setAll(false)} /> : <p className="sf-state-hint">All of Thapal's pages by topic, including settings, planning and checks.</p>}
      </section>
    </div>
  );
}
