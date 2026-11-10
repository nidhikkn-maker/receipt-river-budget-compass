// Acceptance: nothing in the app opens a browser pop-up (window.prompt or window.confirm). Pop-ups are blocked in the
// preview frame and some installed apps (where they silently return null/false), cannot be styled, labelled or
// validated, and cannot state what an action does. Scans every source file in src (tests excluded) with the TypeScript
// parser, so a call is found however it is formatted, and a local function or parameter that happens to be named
// `prompt` or `confirm` (e.g. step-up.ts, ArchivedRecords.tsx) is not mistaken for the browser one.
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(`${dir}/${d.name}`) : [`${dir}/${d.name}`],
  );
const isTest = (f: string) => /\.(test|spec)\.tsx?$/.test(f) || f.startsWith("src/test/");
const sources = () =>
  walk("src").filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".d.ts") && !isTest(f));

/** Lines of browser pop-up calls in `text`: window/globalThis/self.<name>(...) or a bare <name>(...) that is not a local binding. */
function browserCalls(name: "prompt" | "confirm", file: string, text: string): number[] {
  const src = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  let localBinding = false;
  const calls: ts.CallExpression[] = [];
  const visit = (n: ts.Node) => {
    if (
      (ts.isParameter(n) || ts.isVariableDeclaration(n) || ts.isBindingElement(n)) &&
      ts.isIdentifier(n.name) &&
      n.name.text === name
    )
      localBinding = true;
    if (
      (ts.isFunctionDeclaration(n) || ts.isImportSpecifier(n) || ts.isImportClause(n)) &&
      n.name?.text === name
    )
      localBinding = true;
    if (ts.isCallExpression(n)) calls.push(n);
    ts.forEachChild(n, visit);
  };
  visit(src);
  const line = (n: ts.Node) => src.getLineAndCharacterOfPosition(n.getStart(src)).line + 1;
  return calls
    .filter(
      ({ expression: e }) =>
        (ts.isPropertyAccessExpression(e) &&
          e.name.text === name &&
          ts.isIdentifier(e.expression) &&
          ["window", "globalThis", "self"].includes(e.expression.text)) ||
        (ts.isIdentifier(e) && e.text === name && !localBinding),
    )
    .map(line);
}
const browserPromptCalls = (file: string, text: string) => browserCalls("prompt", file, text);
const browserConfirmCalls = (file: string, text: string) => browserCalls("confirm", file, text);

// Fixed in the first pass (Plan, account settings, DocuRepo) and the second (destructive actions, approvals, period
// closing and the remaining value edits). Each must stay free of both kinds of pop-up.
const FIXED = [
  "src/routes/_authenticated/plan.tsx",
  "src/components/AccountTools.tsx",
  "src/routes/_authenticated/vault.tsx",
  "src/components/ExpenseDialog.tsx",
  "src/components/trip/TripSections.tsx",
  "src/components/books/AccountingJournalReview.tsx",
  "src/components/books/CompanyAccess.tsx",
  "src/components/books/TaxCentre.tsx",
  "src/routes/_authenticated/strategy.tsx",
  "src/routes/_authenticated/audit.tsx",
  "src/components/books/PropertyPanel.tsx",
  "src/components/FinanceSettings.tsx",
  "src/components/OrganisationDirectory.tsx",
  "src/components/SplitAndClaim.tsx",
  "src/components/WealthPanels.tsx",
];

describe("acceptance: no browser pop-ups (window.prompt / window.confirm) anywhere in the app", () => {
  it("the detector finds window.prompt( and bare prompt( and ignores a local function named prompt", () => {
    expect(
      browserPromptCalls(
        "a.tsx",
        'const v = window.prompt("Name", x);\nconst w = prompt("Amount");\nglobalThis.prompt("x");',
      ),
    ).toEqual([1, 2, 3]);
    expect(
      browserPromptCalls(
        "b.ts",
        'export async function f(prompt: (a: string) => Promise<boolean>) { return prompt("ok"); }',
      ),
    ).toEqual([]);
    expect(
      browserPromptCalls("c.ts", '// window.prompt("not code")\nconst s = "window.prompt(";'),
    ).toEqual([]);
  });

  it("the detector finds window.confirm( and bare confirm( and ignores a local function named confirm", () => {
    expect(
      browserConfirmCalls(
        "d.tsx",
        'if (!window.confirm("Delete?")) return;\nif (confirm("Cancel?")) go();\nself.confirm("x");',
      ),
    ).toEqual([1, 2, 3]);
    expect(
      browserConfirmCalls(
        "e.tsx",
        "const confirm = async (r: string) => save(r);\nvoid confirm(reason);",
      ),
    ).toEqual([]);
    expect(browserConfirmCalls("f.ts", 'await confirmAction("ok"); store.confirm(x);')).toEqual([]);
  });

  it("every screen fixed so far contains no window.prompt(, window.confirm( or browser prompt(/confirm( call", () => {
    for (const f of FIXED) {
      const text = readFileSync(f, "utf8");
      expect(/window\.(prompt|confirm)\(/.test(text), f).toBe(false);
      expect(browserPromptCalls(f, text), f).toEqual([]);
      expect(browserConfirmCalls(f, text), f).toEqual([]);
    }
  });

  it("strict: no browser prompt or confirm anywhere in src outside tests", () => {
    const found: Record<string, { prompt: number[]; confirm: number[] }> = {};
    for (const f of sources()) {
      const text = readFileSync(f, "utf8");
      const prompt = browserPromptCalls(f, text);
      const confirm = browserConfirmCalls(f, text);
      if (prompt.length || confirm.length) found[f] = { prompt, confirm };
    }
    expect(found).toEqual({});
  });
});
