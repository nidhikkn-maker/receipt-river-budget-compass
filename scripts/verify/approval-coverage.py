#!/usr/bin/env python3
"""Coverage check for the Approval Implementation Register.

Reads docs/registers/decisions/APPROVAL_IMPLEMENTATION_REGISTER.csv and
- fails (exit 1) on: an invalid status; a Verified row without independent_review or impl_commit;
  a Superseded row without superseded_by; a duplicate decision_id; missing columns;
- prints counts by status and lists the Unassigned and Blocked rows;
- with --screens G07,I10, lists the decisions that apply to those screens and are not Verified
  (Superseded rows are left out). Rows whose screen_ids is ALL are cross-cutting and listed apart.

screen_ids syntax: tokens separated by ';'. A token is a screen (G07, A01.1), a range in one module
(G01-G11), a module letter (J), or ALL.

Usage: approval-coverage.py [--csv PATH] [--screens IDS] [--strict] [--all-cross-cutting]
  --strict  exit 3 when --screens finds an applicable decision that is not Verified (for candidate gates)
"""
import argparse, csv, re, sys
from collections import Counter
from pathlib import Path

STATUSES = ["Unassigned", "Assigned", "Implemented-unverified", "Verified", "Blocked", "Superseded"]
COLUMNS = ["decision_id", "statement", "source", "source_date", "supersedes", "superseded_by", "workstream_owner",
           "modules", "screen_ids", "dependency", "impl_branch", "impl_commit", "test_before_fails", "test_after_passes",
           "cross_module_evidence", "independent_review", "preview_device_evidence", "status", "open_defects",
           "owner_approval_needed"]
OWNERS = {"Track A", "Track B", "WS-E", "WS-F1", "Lead", "Unassigned"}
EMPTY = {"", "-", "n/a", "na", "none", "no", "tbd", "unknown"}
DEFAULT_CSV = Path(__file__).resolve().parents[2] / "docs/registers/decisions/APPROVAL_IMPLEMENTATION_REGISTER.csv"
SCREEN_RE = re.compile(r"^([A-Z])(\d{2})(?:\.\d+)?$")
RANGE_RE = re.compile(r"^([A-Z])(\d{2})-(?:\1)?(\d{2})$")


def blank(v):
    return (v or "").strip().lower() in EMPTY


def short(text, n=110):
    text = " ".join((text or "").split())
    return text if len(text) <= n else text[: n - 1] + "…"


def matches(token, screen):
    """True when one screen_ids token applies to one screen id such as G07 or A01.1."""
    token = token.strip().upper()
    s = screen.strip().upper()
    if not token or token == "ALL":
        return False
    if token == s or s.startswith(token + "."):
        return True
    m = SCREEN_RE.match(s)
    if not m:
        return False
    letter, num = m.group(1), int(m.group(2))
    if len(token) == 1:
        return token == letter
    r = RANGE_RE.match(token)
    if r:
        return r.group(1) == letter and int(r.group(2)) <= num <= int(r.group(3))
    return False


def load(path):
    with open(path, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        missing = [c for c in COLUMNS if c not in (reader.fieldnames or [])]
        return list(reader), missing


def validate(rows, missing):
    errors, warnings = [], []
    if missing:
        errors.append(f"missing columns: {', '.join(missing)}")
        return errors, warnings
    seen = Counter(r["decision_id"].strip() for r in rows)
    for did, n in seen.items():
        if not did:
            errors.append("a row has an empty decision_id")
        elif n > 1:
            errors.append(f"{did}: duplicate decision_id ({n} rows)")
    ids = set(seen)
    for r in rows:
        did, st = r["decision_id"].strip(), r["status"].strip()
        if st not in STATUSES:
            errors.append(f"{did}: invalid status {st!r}")
        if st == "Verified":
            if blank(r["independent_review"]):
                errors.append(f"{did}: Verified without independent_review")
            if blank(r["impl_commit"]):
                errors.append(f"{did}: Verified without impl_commit")
        if st == "Superseded" and blank(r["superseded_by"]):
            errors.append(f"{did}: Superseded without superseded_by")
        for ref in re.split(r"[;,]\s*", r["superseded_by"].strip()):
            ref = ref.split(" ")[0]
            if ref and ref not in ids:
                warnings.append(f"{did}: superseded_by {ref} is not a decision_id in the register")
        if r["workstream_owner"].strip() not in OWNERS:
            warnings.append(f"{did}: workstream_owner {r['workstream_owner']!r} is not one of {sorted(OWNERS)}")
        if did.startswith("KK-") and not re.match(r"^KK-\d{8}-\d{2}$", did):
            warnings.append(f"{did}: new IDs use KK-YYYYMMDD-NN")
    return errors, warnings


def report(rows):
    counts = Counter(r["status"].strip() for r in rows)
    print(f"Approval Implementation Register: {len(rows)} decisions")
    for st in STATUSES:
        print(f"  {st:<24}{counts.get(st, 0):>4}")
    for st in ("Unassigned", "Blocked"):
        listed = [r for r in rows if r["status"].strip() == st]
        print(f"\n{st} ({len(listed)}):")
        for r in listed:
            extra = f"  [owner approval: {short(r['owner_approval_needed'], 70)}]" if st == "Blocked" else ""
            print(f"  {r['decision_id']:<20}{short(r['statement'], 90)}{extra}")


def screens_report(rows, screens, show_all_cross):
    direct, cross = [], []
    for r in rows:
        if r["status"].strip() in ("Verified", "Superseded"):
            continue
        tokens = [t for t in r["screen_ids"].split(";") if t.strip()]
        hit = [s for s in screens if any(matches(t, s) for t in tokens)]
        if hit:
            direct.append((r, hit))
        elif any(t.strip().upper() == "ALL" for t in tokens):
            cross.append(r)
    print(f"\nDecisions applicable to {', '.join(screens)} and not Verified: {len(direct)}")
    for r, hit in direct:
        print(f"  {r['decision_id']:<20}{r['status']:<24}{r['workstream_owner']:<11}{','.join(hit):<10}{short(r['statement'], 80)}")
        if not blank(r["open_defects"]):
            print(f"  {'':<20}open: {short(r['open_defects'], 140)}")
    print(f"\nCross-cutting decisions (screen_ids ALL) not Verified: {len(cross)}")
    if show_all_cross:
        for r in cross:
            print(f"  {r['decision_id']:<20}{r['status']:<24}{r['workstream_owner']:<11}{short(r['statement'], 80)}")
    else:
        print("  " + ", ".join(r["decision_id"] for r in cross) + ("  (use --all-cross-cutting for details)" if cross else ""))
    return direct


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--csv", default=str(DEFAULT_CSV))
    ap.add_argument("--screens", help="comma-separated screen IDs, e.g. G07,I10")
    ap.add_argument("--strict", action="store_true")
    ap.add_argument("--all-cross-cutting", action="store_true")
    a = ap.parse_args()

    rows, missing = load(a.csv)
    errors, warnings = validate(rows, missing)
    if not missing:
        report(rows)
    for w in warnings:
        print(f"WARNING: {w}")
    direct = []
    if a.screens and not missing:
        screens = [s.strip().upper() for s in a.screens.split(",") if s.strip()]
        direct = screens_report(rows, screens, a.all_cross_cutting)
    if errors:
        print(f"\nFAILED: {len(errors)} problem(s)")
        for e in errors:
            print(f"  {e}")
        return 1
    print("\nRegister checks passed.")
    if a.strict and direct:
        print(f"STRICT: {len(direct)} applicable decision(s) not Verified")
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
