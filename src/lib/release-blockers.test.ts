// Production release blockers (KK, 9 Nov 2026) must stay visible across phases: an Open blocker may not
// disappear, and none of its requirements may be marked complete in the implementation register.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
function csv(path: string): Record<string, string>[] {
  const text = readFileSync(join(ROOT, path), "utf8").trim();
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
    else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  row.push(cell); rows.push(row);
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries((head ?? []).map((h, i) => [h, r[i] ?? ""])));
}

const blockers = csv("docs/registers/blockers/production_release_blockers.csv");
const status = new Map(csv("docs/registers/implementation/requirements_status.csv").map((r) => [r["req_id"], r["completion"]]));

describe("production release blockers", () => {
  it("the seven Phase 1 blockers are present", () => {
    for (let i = 1; i <= 7; i++) expect(blockers.some((b) => b["blocker_id"] === `RB-P1-0${i}`), `RB-P1-0${i}`).toBe(true);
  });
  it("closing a blocker requires recorded evidence", () => {
    for (const b of blockers) if (b["status"] !== "Open") expect(b["current_evidence"], b["blocker_id"]).toMatch(/\S{20,}/);
  });
  it("requirements behind an open blocker are never marked complete", () => {
    for (const b of blockers.filter((x) => x["status"] === "Open")) {
      for (const req of (b["requirements"] ?? "").split(";").filter(Boolean)) {
        expect(status.has(req), `${b["blocker_id"]}: unknown ${req}`).toBe(true);
        expect(status.get(req), `${b["blocker_id"]} keeps ${req} open`).not.toMatch(/^Complete/);
      }
    }
  });
});
