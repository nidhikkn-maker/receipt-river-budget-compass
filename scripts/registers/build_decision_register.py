"""Record 3 of 3 — DECISION REGISTER (what KK has approved, rejected or deferred).

Sources: V4 master (50 agreed V3 decisions, 14 approved P3 decisions, V4 §12 remaining approvals),
KK instructions in this development conversation (9 Nov 2026), and the Gate 1 Decision Needed records.
Output: docs/registers/decisions/decision_register.csv
Every row says what is decided, by whom/when, its status, and what it does NOT authorise.
"""
import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
M = ROOT / "docs/registers/master"
OUT = ROOT / "docs/registers/decisions"; OUT.mkdir(parents=True, exist_ok=True)
NOT_DEPLOY = "Does not authorise production migration, screen activation, protected merge or publication."
rows = []
def add(**k):
    rows.append({"decision_id": k["id"], "topic": k["topic"], "decision": k["decision"], "status": k["status"], "source": k["source"],
                 "date": k.get("date", "2026-11-09"), "limits": k.get("limits", ""), "affects": k.get("affects", ""), "implementation_note": k.get("note", "")})

for d in csv.DictReader(open(M / "v3_decisions.csv", encoding="utf-8")):
    add(id=f"V3-D{int(d['decision_no']):02d}", topic=d["decision"], decision=d["recommendation_agreed"], status=d["status"], source="V4 master: Decisions for KK (V3)")

DIFF = {"DN-P3-5": "Changed from Claude's proposed default (a, companies only).", "DN-P3-7": "Changed from proposed default (a, members could read).",
        "DN-P3-8": "Changed from proposed default (a, keep both checks).", "DN-P3-13": "Made mandatory before authoritative close.",
        "DN-P3-14": "Changed from proposed default (a, guests could post journals)."}
for d in csv.DictReader(open(M / "p3_decisions.csv", encoding="utf-8")):
    add(id=d["decision_id"], topic="P3 accounting policy", decision=d["approved_choice"], status="Approved (policy)", source="V4 §11 (KK, 9 Nov 2026)",
        limits=NOT_DEPLOY, affects="P3 migration, accounting tests", note=(d["implementation_condition"] + " " + DIFF.get(d["decision_id"], "")).strip())

KK = [
 ("DN-01", "Logo", "Preserve Option 02 minimalist T direction; current SVG not final until approved artwork supplied", "Approved direction; artwork pending", "KK 9 Nov; V4 FND-06"),
 ("DN-02", "Visual design", "Preserve approved Signature Flow (Concept 06) colours, typography and layout; no new designs without approval", "Approved", "KK 9 Nov; V4 §9"),
 ("DN-03", "Navigation", "Home, Money, To-do, Records with one central Add; preserve access to existing functions", "Approved", "KK 9 Nov; V4 FND-06"),
 ("DN-04", "Accounting engine", "Extend the existing accounting engine; one authoritative balanced journal; no second ledger", "Approved", "KK 9 Nov; V4 FND-01"),
 ("DN-05", "Roles", "Adopt V3.1 roles through controlled migration; preserve existing effective rights", "Approved", "KK 9 Nov; V4 FND-04"),
 ("DN-06", "Sessions", "5-minute phone / 15-minute desktop idle lock; step-up for approvals and exports", "Approved target", "KK 9 Nov; V4 Gate A, §12"),
 ("DN-07", "Internal identifiers", "Retain internal identifiers wherever changing them could affect existing data", "Approved", "KK 9 Nov"),
 ("DN-08", "Reference documents", "V3 master and Signature Flow handoff supplied as reference; V4 master is now authoritative", "Superseded by V4", "KK 9 Nov (V4 supplied)"),
 ("DN-09", "Legacy team-expense", "Preserve old team-expense functionality and history until replacements are verified; no deletion during role migration", "Approved", "KK 9 Nov; V4 FND-05"),
 ("V4-AUTH", "V4 authority", "V4 Production Readiness Master is the authoritative specification; target verified 9.9-10/10 per category with evidence", "Approved", "KK 9 Nov"),
 ("V4-P2MAP", "P2 legacy grant mapping", "No existing can-edit grant automatically gains Bookkeeper posting or Company Secretary powers; preserve effective rights", "Approved (overrides Claude's proposed write->bookkeeper mapping)", "V4 FND-04, §12"),
 ("V4-TS", "Test quality", "Remove type-check suppression from critical SQL acceptance tests; run isolation tests sequentially if needed; record commit, DB version, repeats", "Approved requirement", "V4 FND-04, §8"),
 ("V4-TEAMUI", "Team Access wording", "Correct Team Access UI wording before P1 activation", "Approved requirement", "V4 FND-04"),
 ("V4-STAGED", "Older staged SQL", "No automatic application of previously staged SQL; compare one by one with P1-P3", "Approved requirement", "V4 §4"),
]
KK += [
 ("DN-P0-RET", "Retention of stored collections", "Size limits only for genuinely disposable interface data; financial, security, statutory and audit evidence (dismissed reminders, cooling-off, travel approvals, commitments, reimbursement evidence, audit marks) never silently deleted; each collection classified and tested", "Approved; implemented locally (src/lib/retention.ts)", "KK 9 Nov (Phase 0 decision 1)"),
 ("DN-P0-BASE", "Production historical-baseline check", "Prepare readiness assessment (runtime, impact, data protection, limits, evidence); do not execute on production without separate approval", "Approved preparation only; run not authorised", "KK 9 Nov (Phase 0 decision 2)"),
 ("DN-P1", "Phase 1 security", "Accepted as completed isolated development with its test evidence; NOT approved as production-ready", "Accepted (isolated only)", "KK 9 Nov (Phase 1 review)"),
 ("DN-P1-DEPLOY", "P1/P2/P4 production deployment", "Do not apply yet; first prepare production-like migration, rollback, backup, restore, compatibility and access-control verification evidence", "Not authorised", "KK 9 Nov (Phase 1 review, decision 1)"),
 ("DN-P1-PASSKEY", "Passkey registration", "Fresh strong authentication before registering or replacing a passkey; Google-only accounts use a trusted method without a password; a 4-digit PIN never authorises credential changes", "Approved requirement", "KK 9 Nov (Phase 1 review, decision 2)"),
 ("DN-P1-HOSTED", "Hosted capability assessment", "Restricted read-only assessment with authorised test credentials and non-sensitive test accounts; no change to hosted auth, database hooks, permissions or records; any state-changing test needs separate approval", "Approved (read-only only)", "KK 9 Nov (Phase 1 review, decision 3)"),
 ("DN-P1-BLOCKERS", "Phase 1 release blockers", "Six Phase 1 gaps stay open as mandatory production release blockers (docs/registers/blockers/production_release_blockers.csv); requirements not marked fully implemented until evidence exists", "Approved", "KK 9 Nov (Phase 1 review, decision 6)"),
 ("DN-P2", "Phase 2 database foundation", "Develop in isolated environment only: legal-entity separation, relational structures, permanent record IDs, account linkage, preservation of historical records; backward compatible until migration independently verified; no production data migration, deploy, production-branch merge or Lovable change; stop before Phase 3", "Approved (isolated only)", "KK 9 Nov (Phase 1 review, decision 5)"),
]
for i, t, d, s, src in KK: add(id=i, topic=t, decision=d, status=s, source=src, limits=NOT_DEPLOY if i not in ("DN-08",) else "")

PENDING = [
 ("APR-LIVE-ROLES", "Live role inventory (read-only query)", "Not authorised. Submit exact read-only SQL with output minimisation for approval."),
 ("APR-PROD-READONLY", "Read-only production checks (schema, PG version, row counts)", "Not authorised; each exact query needs separate approval."),
 ("APR-P1", "Apply P1 security containment to production", "Not authorised."),
 ("APR-P2", "Apply P2 role model to production / activate it", "Not authorised (separate identity/role migration and activation approvals)."),
 ("APR-P3", "Apply P3 posting layer and activate accounting screens", "Not authorised (migration and UI activation approved separately)."),
 ("APR-MERGE", "Merge development branch into protected/production branch", "Not authorised."),
 ("APR-PUBLISH", "Publish / deploy / domain or branding change on live site", "Not authorised; ledgerline.biz stays operational and untouched."),
 ("APR-LOGO", "Final Option 02 SVG artwork", "Awaiting approved artwork."),
 ("APR-GOLDEN-DOCS", "Golden real-document test sets", "Awaiting KK approval and privacy controls."),
 ("APR-PROVIDERS", "Provider integrations (AA, email intake, licensed prices, filing intermediaries)", "Deferred; approval and verified licensing/accuracy before enabling."),
 ("C11", "Statement Desk 'Apply everything' vs Decision 4", "Awaiting KK: options and consequences in docs/decisions/OPEN_CONFLICTS_C11_C13_C14_2026-11-09.md"),
 ("C13", "Audit retention after user erasure (DPDP)", "Awaiting KK: options and consequences in docs/decisions/OPEN_CONFLICTS_C11_C13_C14_2026-11-09.md"),
 ("C14", "thapal.in domain and passkey re-registration", "Awaiting KK: options and consequences in docs/decisions/OPEN_CONFLICTS_C11_C13_C14_2026-11-09.md"),
 ("APR-MCP-TOKENS", "External assistant token scope/revocation design", "Pending design; implement effective revoke and step-up barrier (V4 §12)."),
]
for i, t, d in PENDING: add(id=i, topic=t, decision=d, status="Pending / not authorised", source="V4 §1, §10, §12; KK 9 Nov")

with open(OUT / "decision_register.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
from collections import Counter
print(len(rows), Counter(r["status"].split(" (")[0] for r in rows))
