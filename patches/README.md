# Dependency patches

This project carries one patched dependency (applied via
`patchedDependencies` in `package.json`).

## tsyringe@4.10.0

`tsyringe` (via SimpleWebAuthn / `@peculiar/x509`) is patched to inline a
Reflect metadata polyfill. The edge bundle cannot guarantee a separate
polyfill import runs first; without it every published request returns 500.
Do not remove this patch unless the edge runtime is changed or tsyringe is
dropped from the dependency tree.

## entities / @react-email/render — former patches, now removed

Two patches used to exist here (`entities@7.0.1.patch` and
`@react-email/render@2.2.0.patch`), plus a global `entities: 7.0.1` override
in `package.json` and an `entities` alias in `vite.config.ts`. They were all
removed on 2026-11-02.

### Why they existed

- `@react-email/render@2.2.0` imports the v4-style deep path
  `entities/lib/decode.js` and depends on `entities@^4.5.0`.
- `htmlparser2@10` depends on `entities@^7`, which no longer ships
  `lib/decode.js` (only the modern `entities/decode` subpath).
- A global `entities: 7.0.1` override had been added "for htmlparser2@10".
  That forced entities@7 onto every consumer, including
  `@react-email/render` and the nested `htmlparser2@8` under
  `@react-email/components`, which need v4 internals (`BinTrieFlags`,
  `lib/decode.js`). The two patches and the Vite alias were workarounds for
  the conflict the override itself created.

### The actual fix

No override is needed at all: each package's own dependency range resolves
correctly on its own.

- `htmlparser2@10` → nested `entities@7` (uses `entities/decode`)
- `@react-email/render` → top-level `entities@4.5.0` (uses
  `entities/lib/decode.js`)
- `parse5` → nested `entities@6`

Removing the override, both patches, and the Vite alias fixed the production
build and the test suite with zero workarounds.

### If an `entities` resolution error ever resurfaces

1. Do NOT add a global `entities` override — that is what caused the
   conflict.
2. Check which versions each consumer needs:
   `grep -E '"entities"' node_modules/<pkg>/package.json`
3. Let the lockfile nest the right copy per consumer. If a single package is
   broken, patch only that package's import path via `bun patch <pkg>`,
   never the shared `entities` package.
4. Verify with the CI steps: `bun run typecheck`, `bun run build`,
   `bun run test`.
