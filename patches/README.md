# Dependency patches

This project carries three patched dependencies (applied via
`patchedDependencies` in `package.json`). This file explains why each exists
and how to update or remove it safely.

## entities@7.0.1 + @react-email/render@2.2.0

### Why both patches exist

- `htmlparser2@10` (pulled in by the email/template stack) requires
  `entities@7`, so `package.json` overrides `entities` to `7.0.1`.
- `entities@7` only exposes modern subpath exports (`entities/decode`,
  `entities/encode`). It no longer allows the v4-style deep imports
  `entities/lib/decode.js` and `entities/lib/encode.js`.
- `@react-email/render@2.2.0` still imports the legacy path
  `entities/lib/decode.js`. Without a fix this fails both the rolldown
  production build and vitest with "missing entities/decode"-style resolution
  errors.

Two patches cover the two directions of the same problem:

1. `entities@7.0.1.patch` — re-adds the legacy `./lib/decode.js` and
   `./lib/encode.js` subpath mappings to the `entities` package.json, so any
   other dependency still using v4-style deep imports keeps working.
2. `@react-email/render@2.2.0.patch` — rewrites its import from
   `entities/lib/decode.js` to the modern `entities/decode`, so the email
   renderer itself no longer depends on the legacy path.

Both are needed: patch 2 fixes the known offender, patch 1 is the safety net
for anything else in the tree that still deep-imports `entities/lib/*`.

### How to update safely

When bumping `entities`, `htmlparser2`, or `@react-email/render`:

1. Make the version change, then run `bun install`.
2. Check whether the patches still apply. If bun reports a patch no longer
   applies, inspect the new package version:
   - Does the new `entities` already export `./lib/decode.js` /
     `./lib/encode.js`? If yes, delete `entities@7.0.1.patch` and its
     `patchedDependencies` entry.
   - Does the new `@react-email/render` already import `entities/decode`
     (not `entities/lib/decode.js`)? If yes, delete
     `@react-email/render@2.2.0.patch` and its entry.
3. Regenerate any patch that is still needed against the new version:
   edit the package under `node_modules`, then run
   `bun patch <pkg>` / `bun patch --commit <pkg>` and commit the new patch
   file.
4. Verify before committing: `bun run typecheck`, `bun run build`, and
   `bun run test` must all pass. The CI workflow (`.github/workflows/ci.yml`)
   runs the same three checks.

### How to remove them entirely

Only remove both patches once no package in the dependency tree imports
`entities/lib/*` anymore. Check with:

```sh
grep -rl "entities/lib/" node_modules --include="*.js" --include="*.mjs" --include="*.cjs"
```

If nothing matches, delete both patch files, remove their
`patchedDependencies` entries, run `bun install`, and re-run typecheck,
build, and tests.

## tsyringe@4.10.0

`tsyringe` (via SimpleWebAuthn / `@peculiar/x509`) is patched to inline a
Reflect metadata polyfill. The edge bundle cannot guarantee a separate
polyfill import runs first; without it every published request returns 500.
Do not remove this patch unless the edge runtime is changed or tsyringe is
dropped from the dependency tree.
