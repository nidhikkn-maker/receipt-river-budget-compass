"""Merge independent recheck files into docs/registers/implementation/manual_recheck.csv (later files win).
Order: P0 rechecks (9 Nov) then phase rechecks (recheck_phase*.tsv, in name order)."""
import csv
from pathlib import Path
D = Path(__file__).resolve().parents[2] / "docs/registers/implementation"
files = [D / f for f in ("recheck_security_money.tsv", "recheck_product_uix.tsv", "recheck_dev.tsv")] + sorted(D.glob("recheck_phase*.tsv"))
merged: dict[str, dict] = {}
for f in files:
    for r in csv.DictReader(open(f, encoding="utf-8"), delimiter="\t"):
        assert r["verdict"] in ("Complete (local evidence)", "Partial", "Missing", "Blocked", "Unverified"), (f.name, r["req_id"], r["verdict"])
        merged[r["req_id"]] = {k: r[k] for k in ("req_id", "verdict", "state", "evidence", "reviewer")}
with open(D / "manual_recheck.csv", "w", newline="", encoding="utf-8") as out:
    w = csv.DictWriter(out, fieldnames=["req_id", "verdict", "state", "evidence", "reviewer"]); w.writeheader(); w.writerows(merged.values())
print(f"merged {len(merged)} rechecks from {len(files)} files")
