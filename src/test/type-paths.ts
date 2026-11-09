// Test-only: lists every leaf path of stored TypeScript register types (finance_preferences.data and the JSON columns
// of backed-up tables), using the TypeScript checker on the real source files. The registry completeness test
// classifies each path, so a new id-bearing field cannot be added to a stored type without being registered.
// Reads source files only; never touches Cloud.
import ts from "typescript";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");

export interface TypeRoot { file: string; type: string; prefix: string }
export type LeafKind = "string" | "key" | "unknown";
export interface Leaf { path: string; kind: LeafKind }

/**
 * Leaf paths in registry syntax: `a.b` field, `[]` array item, `{}` map value, `{key}` the map keys themselves.
 * Only string-valued leaves, map keys and untyped (unknown/any) values are returned: numbers and booleans never hold ids.
 */
export function typeLeaves(roots: readonly TypeRoot[]): Leaf[] {
  const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile(join(ROOT, "tsconfig.json"), ts.sys.readFile).config, ts.sys, ROOT);
  const program = ts.createProgram(roots.map((r) => join(ROOT, r.file)), { ...cfg.options, noEmit: true, types: [] });
  const checker = program.getTypeChecker();
  const out = new Map<string, Leaf>();
  const add = (path: string, kind: LeafKind) => out.set(`${path}|${kind}`, { path, kind });
  const walk = (input: ts.Type, path: string, seen: ReadonlySet<ts.Type>) => {
    // Checked before NonNullable: NonNullable<unknown> is `{}`, which would hide an untyped value.
    if (input.flags & (ts.TypeFlags.Unknown | ts.TypeFlags.Any)) { add(path, "unknown"); return; }
    const t = checker.getNonNullableType(input);
    if (t.isUnion()) { for (const u of t.types) walk(u, path, seen); return; }
    if (t.flags & ts.TypeFlags.StringLike) { add(path, "string"); return; }
    if (t.flags & (ts.TypeFlags.Unknown | ts.TypeFlags.Any)) { add(path, "unknown"); return; }
    if (!(t.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection)) || seen.has(t)) return;
    const next = new Set(seen).add(t);
    if (checker.isArrayType(t) || checker.isTupleType(t)) { for (const a of checker.getTypeArguments(t as ts.TypeReference)) walk(a, `${path}[]`, next); return; }
    for (const info of checker.getIndexInfosOfType(t)) { add(`${path}{key}`, "key"); walk(info.type, `${path}{}`, next); }
    for (const prop of checker.getPropertiesOfType(t)) {
      const pt = checker.getTypeOfSymbol(prop);
      if (pt.getCallSignatures().length) continue;
      walk(pt, path ? `${path}.${prop.name}` : prop.name, next);
    }
  };
  for (const r of roots) {
    const sf = program.getSourceFile(join(ROOT, r.file));
    const mod = sf && checker.getSymbolAtLocation(sf);
    const sym = mod && checker.getExportsOfModule(mod).find((s) => s.name === r.type);
    if (!sym) throw Error(`${r.file} does not export ${r.type}`);
    walk(checker.getDeclaredTypeOfSymbol(sym), r.prefix, new Set());
  }
  return [...out.values()].sort((a, b) => a.path.localeCompare(b.path));
}
