// Acceptance: value edits never open a browser pop-up (window.prompt). Pop-ups are blocked in the preview frame and some
// installed apps, cannot be styled, labelled or validated, and silently return null. Scans every source file in src
// (tests excluded) with the TypeScript parser, so a call is found however it is formatted and a local function or
// parameter that happens to be named `prompt` (e.g. step-up.ts) is not mistaken for the browser one.
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

/** Lines of browser prompt calls in `text`: window/globalThis/self.prompt(...) or a bare prompt(...) that is not a local binding. */
function browserPromptCalls(file: string, text: string): number[] {
  const src = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  let localPrompt = false;
  const calls: ts.CallExpression[] = [];
  const visit = (n: ts.Node) => {
    if (
      (ts.isParameter(n) || ts.isVariableDeclaration(n) || ts.isBindingElement(n)) &&
      ts.isIdentifier(n.name) &&
      n.name.text === "prompt"
    )
      localPrompt = true;
    if (
      (ts.isFunctionDeclaration(n) || ts.isImportSpecifier(n) || ts.isImportClause(n)) &&
      n.name?.text === "prompt"
    )
      localPrompt = true;
    if (ts.isCallExpression(n)) calls.push(n);
    ts.forEachChild(n, visit);
  };
  visit(src);
  const line = (n: ts.Node) => src.getLineAndCharacterOfPosition(n.getStart(src)).line + 1;
  return calls
    .filter(
      ({ expression: e }) =>
        (ts.isPropertyAccessExpression(e) &&
          e.name.text === "prompt" &&
          ts.isIdentifier(e.expression) &&
          ["window", "globalThis", "self"].includes(e.expression.text)) ||
        (ts.isIdentifier(e) && e.text === "prompt" && !localPrompt),
    )
    .map(line);
}

// Fixed here: the value edits on Plan, account settings and DocuRepo use the in-app ValueDialog.
const FIXED = [
  "src/routes/_authenticated/plan.tsx",
  "src/components/AccountTools.tsx",
  "src/routes/_authenticated/vault.tsx",
];
// Browser prompts still to be replaced, by file and count. This list may only shrink: a new prompt anywhere fails, and
// replacing one fails until its count here is lowered, so the list always matches the code.
const KNOWN_REMAINING: Record<string, number> = {
  "src/components/ExpenseDialog.tsx": 4,
  "src/components/FinanceSettings.tsx": 1,
  "src/components/OrganisationDirectory.tsx": 1,
  "src/components/SplitAndClaim.tsx": 1,
  "src/components/WealthPanels.tsx": 1,
  "src/components/books/AccountingJournalReview.tsx": 1,
  "src/components/books/CompanyAccess.tsx": 1,
  "src/components/books/PropertyPanel.tsx": 4,
  "src/routes/_authenticated/audit.tsx": 2,
};

describe("acceptance: no browser pop-up prompts for value edits", () => {
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

  it("Plan, account settings and DocuRepo contain no window.prompt( or browser prompt( call", () => {
    for (const f of FIXED) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/window\.prompt\(/);
      expect(browserPromptCalls(f, text), f).toEqual([]);
    }
  });

  it("no browser prompt anywhere in src outside the shrinking list of known remaining ones", () => {
    const found: Record<string, number> = {};
    for (const f of sources()) {
      const n = browserPromptCalls(f, readFileSync(f, "utf8")).length;
      if (n) found[f] = n;
    }
    expect(found).toEqual(KNOWN_REMAINING);
  });
});
