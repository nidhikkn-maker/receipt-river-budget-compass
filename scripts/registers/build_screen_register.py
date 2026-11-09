"""Gate 1 register 2 (V3.1 §2.2): 111-Screen Coverage Register.

Inputs: docs/specs/THAPAL_V3_1_CONTRACT_2026-11-09.txt (screen contracts, §8A)
        docs/registers/source/screen_mapping_2026-11-09.tsv (code mapping, audited 9 Nov 2026)
Output: docs/registers/screen_coverage.csv
Blank or "Not ..." cells are open tasks per V3.1 §2 ("a blank or undocumented field is an open task, not a pass").
"""
import csv, re
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
text = (ROOT / "docs/specs/THAPAL_V3_1_CONTRACT_2026-11-09.txt").read_text()
body = text[text.index("A. Onboarding and access\n\nA01"):text.index("9. Required interaction states")]
body = re.sub(r"\s+", " ", body)
ids = [f"{a}{n:02d}" for a, c in zip("ABCDEFGHIJK", [6, 8, 12, 10, 11, 9, 11, 8, 10, 14, 12]) for n in range(1, c + 1)]
contract = {}
for i, sid in enumerate(ids):
    start = body.find(sid + " ")
    nxt = [body.find(x + " ", start + 1) for x in ids[i + 1:i + 3]]
    end = min([n for n in nxt if n > start] or [len(body)])
    contract[sid] = re.sub(r"\s+[A-K]\. [A-Z][A-Za-z ,]+$", "", body[start + len(sid) + 1:end]).strip()
for i, sid in enumerate(ids[:-1]):
    if contract[sid].endswith(" and"):  # e.g. "C02 Bank account index and C03 Bank account detail: ..." share one clause
        contract[sid] = contract[sid][:-4] + " (shares the contract with " + ids[i + 1] + "): " + contract[ids[i + 1]].split(":", 1)[-1].strip()
AREAS = dict(zip("ABCDEFGHIJK", ["Onboarding and access", "Home and universal", "Money and accounts", "Inbox and Statement Desk", "Expenses and Smart Add", "DocuRepo and organizations", "Travel and reimbursements", "Investments", "Assets and property", "Reports and statutory", "Settings and trust"]))
REQUIRED_STATES = ["loading", "empty", "populated", "partial/stale", "offline", "permission denied", "recoverable error", "hard failure", "cancelled", "unsaved draft", "success"]
rows = list(csv.DictReader(open(ROOT / "docs/registers/source/screen_mapping_2026-11-09.tsv"), delimiter="\t"))
assert [r["id"] for r in rows] == ids, "mapping must list all 111 IDs in order"
out = []
for r in rows:
    seen = r["states_seen"].lower()
    missing = [s for s in REQUIRED_STATES if not any(k in seen for k in s.split("/")) and s not in ("populated",)]
    out.append({
        "screen_id": r["id"], "area": AREAS[r["id"][0]], "contract_purpose": contract[r["id"]],
        "route_or_panel": r["route_or_panel"], "source_files": r["source_files"], "parent_navigation": r["parent_navigation"],
        "entry_and_exit": "Entry: " + r["parent_navigation"] + ". Exit/Back context preservation: not verified",
        "canonical_data_source": r["canonical_data_source"], "actions_present": r["contract_elements_present"],
        "contract_gaps": r["contract_elements_missing"], "approvals": "",
        "device_layouts": "Not verified (iPhone 320/375/390/430, iPad 768/820/1024/1180, desktop 1280/1440/1728 required)",
        "required_states_seen": r["states_seen"], "required_states_not_evidenced": "; ".join(missing),
        "screenshot": "Not captured", "visual_baseline": "Not compared: Signature Flow screenshot not supplied",
        "tests": r["tests"], "status": r["status"], "owner_review_status": "Not reviewed",
        "evidence_date": "2026-11-09",
    })
with open(ROOT / "docs/registers/screen_coverage.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(out[0])); w.writeheader(); w.writerows(out)
from collections import Counter
print(len(out), dict(Counter(r["status"] for r in out)))
for a in "ABCDEFGHIJK": print(a, dict(Counter(r["status"] for r in out if r["screen_id"][0] == a)))
