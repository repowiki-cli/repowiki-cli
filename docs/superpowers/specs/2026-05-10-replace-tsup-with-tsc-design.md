# Design: Replace tsup with tsc across all packages

**Date:** 2026-05-10  
**Status:** Approved

---

## Problem

The three plugin packages (`plugin-wiki`, `plugin-context`, `plugin-spec`) currently use two sequential `tsup` invocations in their build scripts:

```bash
# Example: plugin-wiki
tsup src/index.ts --format cjs --dts --clean \
  && tsup src/commands/wiki/generate.ts src/commands/wiki/update.ts src/commands/wiki/validate.ts \
     --format cjs --dts --out-dir dist/commands/wiki
```

This is fragile: every new command file must be manually added to the build script. `tsup src` (glob) was considered but discards directory structure, breaking Oclif's command scanner. `core` and `cli` also use tsup unnecessarily.

---

## Solution

Replace `tsup` with `tsc` across all five packages. Remove `tsup` from all `devDependencies` and from the root `package.json`.

### Why tsc is correct here

- **No bundle requirement.** Oclif plugins and Node.js libraries are loaded via `require` per-file. Bundling (tsup/esbuild's core value) is counterproductive.
- **Directory structure preserved automatically.** `tsc` mirrors `src/` into `dist/` exactly, so Oclif's command directory scanner works without configuration.
- **Zero file enumeration.** New command files are included automatically — no build script changes needed.
- **Already a project dependency.** `typescript` is already in every package's `devDependencies`.

---

## Changes per package

All five packages follow the same pattern:

### `tsconfig.json` (each package)

Add `exclude` to prevent test files from being compiled into `dist/`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["src/**/__tests__/**"]
}
```

The same `tsconfig.json` is used by both `build` and `typecheck` (`tsc --noEmit`). No separate `tsconfig.build.json` needed.

### `package.json` (each package)

Build script:
```json
"build": "tsc -p tsconfig.json"
```

Remove `tsup` from `devDependencies`.

### Root `package.json`

Remove `tsup` from `devDependencies`.

---

## Package-by-package summary

| Package | Old build script | New build script |
|---|---|---|
| `@repowiki/core` | `tsup src/index.ts --format cjs --dts` | `tsc -p tsconfig.json` |
| `@repowiki/plugin-wiki` | `tsup src/index.ts ... && tsup src/commands/wiki/*.ts ...` | `tsc -p tsconfig.json` |
| `@repowiki/plugin-context` | `tsup src/index.ts ... && tsup src/commands/context/*.ts ...` | `tsc -p tsconfig.json` |
| `@repowiki/plugin-spec` | `tsup src/index.ts ... && tsup src/commands/spec/*.ts ...` | `tsc -p tsconfig.json` |
| `repowiki-cli` | `tsup src/index.ts --format cjs --dts` | `tsc -p tsconfig.json` |

---

## dist/ output structure

`tsc` mirrors `src/` exactly (minus `__tests__/`):

```
packages/plugin-wiki/dist/
├── index.js          ← barrel (oclif plugin main entry)
├── index.d.ts
├── index.js.map
└── commands/
    └── wiki/
        ├── generate.js   ← oclif scans this directory
        ├── generate.d.ts
        ├── update.js
        ├── update.d.ts
        ├── validate.js
        └── validate.d.ts
```

Oclif's `"commands": "./dist/commands"` scanner finds all command files automatically.

---

## What does NOT change

- `src/index.ts` barrel files in plugin packages — retained as the `main` entry oclif uses to load the plugin
- `oclif` section in each plugin's `package.json` — unchanged
- `tsconfig.base.json` at repo root — unchanged
- `bin/run.js` in `packages/cli` — unchanged
- `biome.json`, CI workflows, test scripts — unchanged
- `.gitignore` already excludes `dist/` — unchanged

---

## Adding new commands (future)

Create `src/commands/<topic>/<name>.ts`. No build script changes. `yarn build` picks it up automatically.

---

## Verification criteria

- `yarn build` succeeds across all 5 packages with zero errors
- `yarn test` — all 14 tests pass
- `yarn lint` — 0 errors
- `yarn typecheck` — 0 errors
- `node packages/cli/bin/run.js --help` — all 9 commands listed
- `dist/__tests__/` does NOT exist in any package after build
- `tsup` does not appear in any `package.json` `devDependencies`
- `node_modules/tsup` does not exist after `yarn install`
