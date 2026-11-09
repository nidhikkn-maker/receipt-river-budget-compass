"""Record 2 of 3 — IMPLEMENTATION REGISTER (what has actually been built and tested), re-checked at a commit.

Inputs: docs/registers/master/requirements.csv (V4 master, 1,536 REQ rows), the repository at HEAD,
        a vitest JSON report (default: docs/registers/implementation/vitest-report.json),
        docs/registers/implementation/manual_recheck.csv (independent review verdicts; optional).
Output: docs/registers/implementation/requirements_status.csv and summary.json.

Mechanical evidence only proves that claimed files/tests/database objects exist and pass locally.
States follow the V3.1 honesty rule: Not started -> Coded -> Tested (local) -> Deployed -> Production-verified.
Nothing is marked Deployed or Production-verified: the audit has no production access.
"""
import csv, json, re, subprocess, sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IMPL = ROOT / "docs/registers/implementation"; IMPL.mkdir(parents=True, exist_ok=True)
report_path = Path(sys.argv[1]) if len(sys.argv) > 1 else IMPL / "vitest-report.json"
commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
reqs = list(csv.DictReader(open(ROOT / "docs/registers/master/requirements.csv", encoding="utf-8")))

report = json.load(open(report_path))
passed = {str(Path(t["name"]).resolve().relative_to(ROOT)) for t in report["testResults"] if t["status"] == "passed"}
ran = {str(Path(t["name"]).resolve().relative_to(ROOT)) for t in report["testResults"]}

def text_of(paths): return "\n".join(p.read_text(encoding="utf-8", errors="replace") for p in paths)
applied_sql = text_of(sorted((ROOT / "drizzle/migrations").glob("*.sql")))
proposed_sql = text_of(sorted((ROOT / ".lovable/staged-sql/proposed").glob("*.sql")))
staged_sql = text_of(sorted((ROOT / ".lovable/staged-sql").glob("*.sql"))) + (ROOT / "scripts/accounting-foundation.sql").read_text()
src_text = text_of([p for p in (ROOT / "src").rglob("*.ts*") if ".test." not in p.name])

def split(v): return [x.strip() for x in re.split(r"[;,]", v or "") if x.strip()]
def norm_path(p):
    p = re.sub(r"\s*\(.*?\)\s*", "", p).strip().rstrip(".")
    return p
def split_db(v):
    # split on ';' only, outside parentheses (commas inside "(pan, booksFrom)" are part of one object)
    out, depth, cur = [], 0, ""
    for ch in v or "":
        depth += ch == "("; depth -= ch == ")"
        if ch == ";" and depth == 0: out.append(cur); cur = ""
        else: cur += ch
    out.append(cur)
    return [x.strip() for x in out if x.strip()]
def db_status(obj):
    name = re.sub(r"\s*\(.*?\)", "", obj).strip()
    name = re.split(r"[\s=/]", name)[0]  # 'accounts.kind investment', 'a.b/c', "x='y'" -> first identifier
    if name.lower().startswith("rls"): return "applied" if "ENABLE ROW LEVEL SECURITY" in applied_sql else "not-found"
    if not name: return None
    base = name.split(".")[0] if not name.startswith("finance_preferences") else "finance_preferences"
    if name.startswith("finance_preferences.data") or "." in name and not name.startswith(("public.", "storage.")):
        key = name.split(".")[-1]
        return "app-json" if re.search(r"\b" + re.escape(key) + r"\b", src_text) else "json-key-not-found"
    tok = name.split(".")[-1].split(" ")[0]
    pat = re.compile(r"\b" + re.escape(tok) + r"\b", re.I)
    if pat.search(applied_sql): return "applied"
    if pat.search(proposed_sql): return "proposed-only"
    if pat.search(staged_sql): return "staged-only"
    if pat.search(src_text): return "app-only"
    return "not-found"

manual = {}
mp = IMPL / "manual_recheck.csv"
if mp.exists():
    for r in csv.DictReader(open(mp, encoding="utf-8")): manual[r["req_id"]] = r

rows = []
for r in reqs:
    code = [norm_path(p) for p in split(r["claimed_code"]) if "/" in p or p.endswith((".ts", ".tsx", ".yml", ".md", ".json", ".sql", ".py"))]
    code_found = [p for p in code if (ROOT / p).exists()]
    tests = [norm_path(p) for p in split(r["claimed_tests"]) if "/" in p]
    unit_tests = [t for t in tests if re.search(r"\.test\.tsx?$", t)]
    other_tests = [t for t in tests if t not in unit_tests]
    t_pass = [t for t in unit_tests if t in passed]
    t_missing = [t for t in unit_tests if not (ROOT / t).exists()]
    other_found = [t for t in other_tests if (ROOT / t).exists()]
    dbs = [(o, db_status(o)) for o in split_db(r["claimed_db_objects"])]
    dbs = [(o, s) for o, s in dbs if s]
    db_counts = Counter(s for _, s in dbs)
    base = r["v4_baseline_status"]
    limits = r["baseline_known_limits"].strip()
    # Mechanical state (never higher than the evidence allows)
    if base == "Blocked":
        state = "Blocked"
    elif not code_found and not t_pass:
        state = "Not started" if base == "Not started" or not code else "Evidence missing"
    elif t_pass and len(t_pass) == len(unit_tests) and not t_missing:
        state = "Tested (local)"
    elif code_found:
        state = "Coded"
    else:
        state = "Evidence missing"
    if db_counts.get("staged-only") or db_counts.get("proposed-only"):
        flag_db = "depends on unapplied SQL"
    elif db_counts.get("not-found") or db_counts.get("json-key-not-found"):
        flag_db = "claimed DB object not found"
    else:
        flag_db = ""
    # Completion class for reporting: Complete only when tested AND the baseline lists no remaining limits AND no unapplied SQL dependency
    if state == "Blocked": completion = "Blocked"
    elif state in ("Not started", "Evidence missing"): completion = "Missing"
    elif state == "Tested (local)" and not limits and not flag_db and base in ("Implemented", "Partly tested"): completion = "Complete (local evidence)"
    else: completion = "Partial"
    m = manual.get(r["req_id"])
    if m:
        completion = m["verdict"]; state = m.get("state") or state
    rows.append({
        "req_id": r["req_id"], "area_code": r["area_code"], "priority": r["priority"], "summary": r["summary"],
        "v4_baseline_status": base, "completion": completion, "state": state,
        "production_status": "Not verified (no production access)", "device_status": "Not verified" if r["baseline_device_verification"] not in ("n/a", "") else "n/a",
        "code_refs": len(code), "code_refs_found": len(code_found), "missing_code": "; ".join(p for p in code if p not in code_found),
        "unit_tests_claimed": len(unit_tests), "unit_tests_passing": len(t_pass), "missing_tests": "; ".join(t_missing),
        "other_test_evidence_found": "; ".join(other_found),
        "db_objects": "; ".join(f"{o} [{s}]" for o, s in dbs), "db_flag": flag_db,
        "known_limits_at_baseline": limits,
        "independent_recheck": (m or {}).get("evidence", ""), "recheck_by": (m or {}).get("reviewer", ""),
        "evidence_commit": commit,
    })

with open(IMPL / "requirements_status.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
summary = {"commit": commit, "tests": {"files": len(ran), "passed_files": len(passed), "total": report["numTotalTests"], "passed": report["numPassedTests"], "failed": report["numFailedTests"]},
           "completion": Counter(r["completion"] for r in rows), "state": Counter(r["state"] for r in rows),
           "completion_p0": Counter(r["completion"] for r in rows if r["priority"] == "P0"),
           "db_flags": Counter(r["db_flag"] for r in rows if r["db_flag"]),
           "missing_code_refs": sum(1 for r in rows if r["missing_code"]), "missing_test_refs": sum(1 for r in rows if r["missing_tests"]),
           "manual_rechecks": len(manual)}
json.dump(summary, open(IMPL / "summary.json", "w"), indent=1, default=dict)
print(json.dumps(summary, indent=1, default=dict))
