"""Gate 1 register 1 (V3.1 §2.1): Existing Application Architecture Register, generated from code.

Run from repo root: python3 scripts/registers/build_architecture_register.py
Writes docs/registers/architecture_routes.csv, architecture_tables.csv, architecture_functions.csv.
Evidence only: rows are derived from source text; blank judgement columns are open tasks, not passes.
"""
import csv, re, subprocess
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parents[2]
SRC, MIG, OUT = ROOT / "src", ROOT / "drizzle/migrations", ROOT / "docs/registers"
OUT.mkdir(parents=True, exist_ok=True)
rel = lambda p: str(p.relative_to(ROOT))
from functools import lru_cache
@lru_cache(maxsize=None)
def read(p): return p.read_text(encoding="utf-8", errors="replace")

IMPORT = re.compile(r"""from\s+['"]([^'"]+)['"]""")
TABLE = re.compile(r"""\.from\(\s*['"]([a-z_]+)['"]""")
RPC = re.compile(r"""\.rpc\(\s*['"]([a-z_]+)['"]""")

def resolve(spec, base):
    if spec.startswith("@/"): p = SRC / spec[2:]
    elif spec.startswith("."): p = (base.parent / spec)
    else: return None
    for c in [p, *(p.with_name(p.name + e) for e in (".ts", ".tsx")), p / "index.ts", p / "index.tsx"]:
        if c.is_file(): return c.resolve()
    return None

all_src = [p for p in SRC.rglob("*") if p.suffix in (".ts", ".tsx")]
tests = [p for p in all_src if re.search(r"\.test\.tsx?$", p.name)]
imports = {p.resolve(): {r for s in IMPORT.findall(read(p)) if (r := resolve(s, p))} for p in all_src}
importers = defaultdict(set)
for f, deps in imports.items():
    for d in deps: importers[d].add(f)

def closure(start, depth=2):
    seen, frontier = {start}, {start}
    for _ in range(depth):
        frontier = {d for f in frontier for d in imports.get(f, ()) if d not in seen and "/integrations/" not in str(d)}
        seen |= frontier
    return seen

def usage(files):
    t, r = set(), set()
    for f in files:
        s = read(f); t |= set(TABLE.findall(s)); r |= set(RPC.findall(s))
    t -= {"receipts", "documents-bucket"}
    return t, r

# ---- migrations: tables, RLS, policies, functions
mig_files = sorted(MIG.glob("*.sql"))
tbl_created, rls_on, policies, fn_defs = {}, set(), defaultdict(set), defaultdict(list)
for m in mig_files:
    s = read(m); v = m.name.split("_")[0]
    for t in re.findall(r"CREATE TABLE(?: IF NOT EXISTS)?\s+(?:public\.)?\"?([a-z_]+)", s, re.I): tbl_created.setdefault(t, m.name)
    for t in re.findall(r"ALTER TABLE\s+(?:public\.)?\"?([a-z_]+)\"?\s+ENABLE ROW LEVEL SECURITY", s, re.I): rls_on.add(t)
    for name, t in re.findall(r"CREATE POLICY\s+\"([^\"]+)\"\s+ON\s+(?:public\.)?([a-z_]+)", s, re.I): policies[t].add(name)
    for name, t in re.findall(r"DROP POLICY IF EXISTS\s+\"([^\"]+)\"\s+ON\s+(?:public\.)?([a-z_]+)", s, re.I):
        if not re.search(r"CREATE POLICY\s+\"" + re.escape(name) + r"\"\s+ON\s+(?:public\.)?" + t, s, re.I): policies[t].discard(name)
    for name in re.findall(r"CREATE(?: OR REPLACE)? FUNCTION\s+(?:public\.)?([a-z_]+)\s*\(", s, re.I): fn_defs[name].append(v)
HEAD = re.compile(r"CREATE(?: OR REPLACE)? FUNCTION\s+(?:public\.)?([a-z_]+)\s*\((.{0,1500}?)(?:AS\s*)?\$[a-z_]*\$", re.I | re.S)
last_head = {}
for m in mig_files:
    for n, body in HEAD.findall(read(m)): last_head[n] = body
def secdef(name):
    last = last_head.get(name)
    return "yes" if last and "SECURITY DEFINER" in last.upper() else ("no" if last else "")
staged = {n for f in (ROOT / ".lovable/staged-sql").glob("*.sql") for n in re.findall(r"FUNCTION\s+(?:public\.)?([a-z_]+)\s*\(", read(f), re.I)}
staged |= set(re.findall(r"FUNCTION\s+(?:public\.)?([a-z_]+)\s*\(", read(ROOT / "scripts/accounting-foundation.sql"), re.I))

test_set = {t.resolve() for t in tests}
def tests_for(files):
    return sorted({i.name for f in files for i in importers.get(f, ()) if i in test_set})

# ---- routes
rows = []
for p in sorted((SRC / "routes").rglob("*.ts*")):
    if ".test." in p.name: continue
    s = read(p); m = re.search(r"create(?:File|Root)Route\(\s*['\"]([^'\"]+)['\"]", s)
    path = m.group(1) if m else ("__root" if p.name.startswith("__root") else "")
    if not path: continue
    redirect = re.search(r"beforeLoad[^;]*?redirect\(\{\s*to:\s*['\"]([^'\"]+)['\"](?:,\s*search:\s*(\{[^}]*\}))?", s, re.S)
    kind = "api" if "/api/" in path else ("public" if not path.startswith("/_authenticated") else "protected")
    files = closure(p.resolve())
    comps = sorted({rel(f) for f in files if "/components/" in str(f) and "/ui/" not in str(f)})
    serverfns = sorted({rel(f) for f in files if f.name.endswith((".functions.ts", ".server.ts"))})
    t, r = usage(files)
    uses_store = any(f.name == "store.tsx" for f in files)
    rows.append({
        "route": path.replace("/_authenticated", "") or "/", "kind": kind, "source_file": rel(p),
        "redirects_to": (redirect.group(1) + (" " + redirect.group(2) if redirect.group(2) else "")) if redirect else "",
        "ui_components": "; ".join(c.replace("src/components/", "") for c in comps[:12]) + (" …" if len(comps) > 12 else ""),
        "api_services": "; ".join(f.replace("src/lib/", "") for f in serverfns),
        "data_layer": "store.tsx (canonical client layer)" if uses_store else "",
        "tables_direct": "; ".join(sorted(t)), "rpc_direct": "; ".join(sorted(r)),
        "migrations": "; ".join(sorted({tbl_created[x].split('_')[0] for x in t if x in tbl_created})),
        "rls_enabled_all_tables": ("yes" if all(x in rls_on for x in t if x in tbl_created) else "NO") if t else "",
        "staged_only_rpc": "; ".join(sorted(x for x in r if x in staged and x not in fn_defs)),
        "tests": "; ".join(tests_for(files)[:10]),
        "status": "", "defect": "", "proposed_change": "",
    })
with open(OUT / "architecture_routes.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)

# ---- tables
users = defaultdict(set)
for p in all_src:
    if ".test." in p.name: continue
    for t in TABLE.findall(read(p)): users[t].add(rel(p))
trows = [{"table": t, "created_in": tbl_created[t], "rls_enabled": "yes" if t in rls_on else "NO",
          "policies_final": len(policies.get(t, ())), "policy_names": "; ".join(sorted(policies.get(t, ()))),
          "used_by": "; ".join(sorted(users.get(t, ())))[:400], "owner_boundary": "", "defect": ""} for t in sorted(tbl_created)]
with open(OUT / "architecture_tables.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(trows[0])); w.writeheader(); w.writerows(trows)

# ---- database functions called by the app
called = defaultdict(set)
for p in all_src:
    if ".test." in p.name: continue
    for r in RPC.findall(read(p)): called[r].add(rel(p))
frows = [{"function": n, "defined_in_migrations": "; ".join(fn_defs.get(n, [])) or "NOT IN MIGRATIONS",
          "staged_only": "yes" if n in staged and n not in fn_defs else "", "security_definer": secdef(n) if n in fn_defs else "",
          "called_from": "; ".join(sorted(called[n]))} for n in sorted(called)]
with open(OUT / "architecture_functions.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(frows[0])); w.writeheader(); w.writerows(frows)
print(f"routes={len(rows)} tables={len(trows)} rpc={len(frows)} missing_rpc={sum(1 for r in frows if r['defined_in_migrations']=='NOT IN MIGRATIONS')} tables_without_rls={sum(1 for r in trows if r['rls_enabled']=='NO')}")
