#!/usr/bin/env python3
"""Verdict for an acceptance evidence directory written by acceptance-run.sh.

A step is PASSED only with a COMPLETED marker, exit code 0, an unchanged clean tree equal to the frozen tree, and for
test runs a vitest JSON report saying success with 0 failed and >0 tests. A step without COMPLETED is INTERRUPTED
(also when its log looks green). Overall ACCEPTED only if typecheck, build and all required runs PASSED on one tree.
Usage: acceptance-status.py <evidence-dir> [--write]
"""
import json, os, sys

def read(p, default=None):
    try:
        with open(p) as f: return f.read().strip()
    except OSError: return default

def runner_alive(meta):
    pid = meta.get("runner_pid")
    if not pid: return False
    try:
        with open(f"/proc/{pid}/cmdline", "rb") as f: return b"acceptance-run" in f.read()
    except OSError: return False

def judge(out):
    meta = json.loads(read(os.path.join(out, "meta.json"), "{}") or "{}")
    alive = runner_alive(meta) and not os.path.exists(os.path.join(out, "FINISHED"))
    tree, runs_required = meta.get("tree"), int(meta.get("runs_required", 3))
    names = ["typecheck", "build"] + [f"run-{i}" for i in range(1, runs_required + 1)]
    steps = {}
    for n in names:
        d = os.path.join(out, n)
        s = {"name": n}
        if not os.path.isdir(d): s["status"] = "PENDING" if alive else "NOT_RUN"; steps[n] = s; continue
        s.update(commit=read(f"{d}/commit"), started=read(f"{d}/started"), ended=read(f"{d}/ended"),
                 exit_code=read(f"{d}/exit_code"), tree_before=read(f"{d}/tree_before"), tree_after=read(f"{d}/tree_after"))
        if not os.path.exists(f"{d}/COMPLETED"):
            s["status"] = "RUNNING" if alive else "INTERRUPTED"
        elif s["exit_code"] != "0":
            s["status"] = "FAILED"
        elif s["commit"] != meta.get("commit") or s["tree_before"] != tree or s["tree_after"] != tree:
            s["status"] = "TREE_CHANGED"
        else:
            s["status"] = "PASSED"
            if n.startswith("run-"):
                try:
                    r = json.load(open(f"{d}/vitest.json"))
                    s.update(tests_total=r.get("numTotalTests"), tests_passed=r.get("numPassedTests"), tests_failed=r.get("numFailedTests"),
                             files_total=r.get("numTotalTestSuites"), files_failed=r.get("numFailedTestSuites"), success=r.get("success"))
                    if not (r.get("success") is True and r.get("numFailedTests") == 0 and (r.get("numTotalTests") or 0) > 0 and r.get("numFailedTestSuites", 0) == 0):
                        s["status"] = "FAILED"
                except (OSError, ValueError):
                    s["status"] = "NO_RESULT"
        steps[n] = s
    totals = {(s.get("tests_total"), s.get("files_total")) for n, s in steps.items() if n.startswith("run-") and s["status"] == "PASSED"}
    st = [s["status"] for s in steps.values()]
    if all(x == "PASSED" for x in st): verdict = "ACCEPTED"
    elif any(x in ("FAILED", "TREE_CHANGED", "NO_RESULT") for x in st): verdict = "NOT_ACCEPTED"
    elif any(x == "INTERRUPTED" for x in st) or (not alive and any(x == "NOT_RUN" for x in st)): verdict = "INTERRUPTED"
    else: verdict = "RUNNING"
    return {"commit": meta.get("commit"), "tree": tree, "runs_required": runs_required, "verdict": verdict,
            "consistent_test_counts": len(totals) <= 1, "steps": [steps[n] for n in names]}

if __name__ == "__main__":
    out = sys.argv[1]
    res = judge(out)
    if "--write" in sys.argv:
        with open(os.path.join(out, "summary.json"), "w") as f: json.dump(res, f, indent=1)
    print(f"{res['verdict']}  commit {res['commit']}  tree {res['tree']}")
    for s in res["steps"]:
        extra = f" tests {s.get('tests_passed')}/{s.get('tests_total')} files {s.get('files_total')}" if s.get("tests_total") is not None else ""
        print(f"  {s['name']:<10} {s['status']:<12} exit={s.get('exit_code')} {s.get('started','')} → {s.get('ended','')}{extra}")
