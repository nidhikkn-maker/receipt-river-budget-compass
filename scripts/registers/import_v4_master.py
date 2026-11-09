"""Record 1 of 3 — MASTER SPECIFICATION (what Thapal must do), imported verbatim from the V4 master.

Source: docs/specs/THAPAL_V4_MASTER_2026-11-09.md (pandoc conversion of THAPAL_V4_FINAL.docx, 9 Nov 2026).
Writes docs/registers/master/: requirements.csv (1,536 REQ rows), architecture.csv (68 ARC rows),
acceptance_tests.csv, v3_decisions.csv (50 agreed decisions) and p3_decisions.csv (14 approved).
Baseline statuses are copied as "v4_baseline_*" and never upgraded here; current evidence lives in the
implementation register (build_implementation_register.py).
"""
import csv, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "docs/specs/THAPAL_V4_MASTER_2026-11-09.md"
OUT = ROOT / "docs/registers/master"
OUT.mkdir(parents=True, exist_ok=True)
doc = SRC.read_text(encoding="utf-8")

def clean(t: str) -> str:
    t = re.sub(r"\\([_$*`#\[\]|'\"<>~&{}()+.!-])", r"\1", t)  # undo pandoc markdown escapes
    t = re.sub(r"\*\*(.*?)\*\*", r"\1", t)
    return re.sub(r"\s+", " ", t).strip()

def write(name, rows):
    with open(OUT / name, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
    return rows

# ---- Requirements (Appendix B)
b = doc[doc.index("# Appendix B Full Requirement Register Snapshot"):doc.index("# Appendix C")]
blocks = re.split(r"\n(?=\*\*REQ-[A-Z]+-\d+ )", b)[1:]
FIELDS = {"Priority (phase)": "priority", "Depends on": "depends_on", "Code location": "claimed_code", "Database objects": "claimed_db_objects",
          "Tests": "claimed_tests", "Financial verification": "baseline_financial_verification", "Security verification": "baseline_security_verification",
          "Device verification": "baseline_device_verification", "Production status": "baseline_production_status", "Known limits": "baseline_known_limits",
          "Acceptance tests": "acceptance_tests", "Approval": "approval"}
reqs = []
for blk in blocks:
    head = re.match(r"\*\*(REQ-([A-Z]+)-\d+) (.*?) \\\[([^\]]*?)\\\]\*\*", blk, re.S)
    text = re.search(r"Requirement text: (.*?)\n\s*\n", blk, re.S)
    meta = re.search(r"Priority \(phase\): (.*)", blk)
    row = {"req_id": head.group(1), "area_code": head.group(2), "summary": clean(head.group(3)), "requirement_text": clean(text.group(1)) if text else "",
           "v4_baseline_status": head.group(4)}
    for v in FIELDS.values(): row[v] = ""
    parts = clean("Priority (phase): " + meta.group(1)).split(" | ") if meta else []
    for p in parts:
        k, _, val = p.partition(": ")
        if k in FIELDS: row[FIELDS[k]] = val.strip()
    reqs.append(row)
assert len(reqs) == 1536 and len({r["req_id"] for r in reqs}) == 1536, len(reqs)
# area name = the leading words of the summary that repeat across the area
area_names = {}
for r in reqs:
    area_names.setdefault(r["area_code"], []).append(r["summary"])
def common_prefix(xs):
    words = [x.split() for x in xs]; out = []
    for ws in zip(*words):
        if len(set(ws)) == 1: out.append(ws[0])
        else: break
    return " ".join(out)
names = {a: common_prefix(v) or a for a, v in area_names.items()}
for r in reqs:
    r["area_name"] = names[r["area_code"]]
    if names[r["area_code"]] != r["area_code"] and r["summary"].startswith(names[r["area_code"]]):
        r["summary"] = r["summary"][len(names[r["area_code"]]):].strip()
order = ["req_id", "area_code", "area_name", "summary", "requirement_text", "priority", "depends_on", "acceptance_tests", "v4_baseline_status",
         "claimed_code", "claimed_db_objects", "claimed_tests", "baseline_financial_verification", "baseline_security_verification",
         "baseline_device_verification", "baseline_production_status", "baseline_known_limits", "approval"]
write("requirements.csv", [{k: r[k] for k in order} for r in reqs])

# ---- Architecture (Appendix A)
a = doc[doc.index("# Appendix A Architecture Register Snapshot"):doc.index("# Appendix B")]
arcs = []
for blk in re.split(r"\n(?=\*\*ARC-\d+ )", a)[1:]:
    h = re.match(r"\*\*(ARC-\d+) (.*?) \\\[([^\]]*?)\\\]\*\*", blk)
    row = {"arc_id": h.group(1), "feature": clean(h.group(2)), "v4_baseline_status": h.group(3)}
    for label, key in [("Route / screens", "routes"), ("Source files", "source_files"), ("Database tables / JSON keys", "db_objects"),
                       ("Posting mechanism", "posting_mechanism"), ("Defects", "defects"), ("Proposed change", "proposed_change")]:
        m = re.search(re.escape(label) + r": (.*?)(?:\n\s*\n|$)", blk, re.S)
        row[key] = clean(m.group(1)) if m else ""
    arcs.append(row)
assert len(arcs) == 68, len(arcs)
write("architecture.csv", arcs)

# ---- Acceptance tests (V3 "Acceptance tests" section; numbered journeys in pipe/grid tables)
acc_sec = doc[doc.index("\n## Acceptance tests\n"):doc.index("\n## Decisions for KK, with recommendations\n")]
acc = []
for m in re.finditer(r"^\s{2}(\d{1,3})\s{2,}(.+?)\s{2,}(.+?)\s*$", acc_sec, re.M):
    acc.append({"test_no": int(m.group(1)), "journey": clean(m.group(2)), "passes_when": clean(m.group(3))})
v1 = ["New company", "Bank month", "Receipt to books", "Transfer", "Card settlement", "Demat", "Prior-year onboarding", "Asset", "Lease",
      "Travel reimbursement", "Tax and close", "Security", "Recovery", "Devices", "Release"]
for i, j in enumerate(v1, 1):
    if not any(x["test_no"] == i for x in acc):
        acc.append({"test_no": i, "journey": j, "passes_when": "v1 §27 journey (kept unchanged; full text in v1, not reproduced in V4)"})
acc = sorted({x["test_no"]: x for x in acc}.values(), key=lambda x: x["test_no"])
write("acceptance_tests.csv", acc)

# ---- 50 agreed V3 decisions
dsec = doc[doc.index("## Decisions for KK, with recommendations"):doc.index("## Appendix: what carries forward")]
dec = [{"decision_no": int(m.group(1)), "decision": clean(m.group(2)), "recommendation_agreed": clean(m.group(3)), "status": clean(m.group(4))}
       for m in re.finditer(r"^\s{2}(\d{1,2})\s{2,}(.+?)\s{2,}(.+?)\s{2,}(Agreed|[A-Z][a-z]+)\s*$", dsec, re.M)]
write("v3_decisions.csv", dec)

# ---- 14 approved P3 decisions (V4 §11)
psec = doc[doc.index("# 11 Approved P3 accounting decisions"):doc.index("# 12 Remaining approvals")]
p3 = [{"decision_id": m.group(1), "approved_choice": clean(m.group(2)), "implementation_condition": clean(m.group(3))}
      for m in re.finditer(r"^\s{2}(DN-P3-\d+)\s{2,}(.+?)\s{2,}(.+?)\s*$", psec, re.M)]
assert len(p3) == 14, len(p3)
write("p3_decisions.csv", p3)
print(f"requirements={len(reqs)} areas={len(names)} architecture={len(arcs)} acceptance_tests={len(acc)} v3_decisions={len(dec)} p3_decisions={len(p3)}")
