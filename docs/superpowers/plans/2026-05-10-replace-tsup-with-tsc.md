# Replace tsup with tsc Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `tsup` with `tsc` across all five workspace packages, removing tsup entirely from the project.

**Architecture:** Each package's `build` script is changed from tsup invocations to `tsc -p tsconfig.json`. Each `tsconfig.json` gains an `exclude` field to prevent test files from entering `dist/`. tsup is removed from all `devDependencies`. The change is purely mechanical — no source files, no runtime behaviour, no test logic changes.

**Tech Stack:** TypeScript 5 (`tsc`), Yarn Berry v4, Oclif v4, Vitest

---

## File Map

```
package.json                            # remove tsup from devDependencies
packages/core/package.json              # build script: tsup → tsc
packages/core/tsconfig.json             # add exclude
packages/cli/package.json               # build script: tsup → tsc
packages/cli/tsconfig.json              # add exclude
packages/plugin-wiki/package.json       # build script: tsup → tsc
packages/plugin-wiki/tsconfig.json      # add exclude
packages/plugin-context/package.json    # build script: tsup → tsc
packages/plugin-context/tsconfig.json   # add exclude
packages/plugin-spec/package.json       # build script: tsup → tsc
packages/plugin-spec/tsconfig.json      # add exclude
```

---

## Task 1: Update build scripts — all five packages

**Files:**
- Modify: `packages/core/package.json`
- Modify: `packages/cli/package.json`
- Modify: `packages/plugin-wiki/package.json`
- Modify: `packages/plugin-context/package.json`
- Modify: `packages/plugin-spec/package.json`

- [ ] **Step 1: Update `packages/core/package.json`**

Change the `build` script from:
```json
"build": "tsup src/index.ts --format cjs --dts"
```
To:
```json
"build": "tsc -p tsconfig.json"
```

- [ ] **Step 2: Update `packages/cli/package.json`**

Change the `build` script from:
```json
"build": "tsup src/index.ts --format cjs --dts"
```
To:
```json
"build": "tsc -p tsconfig.json"
```

- [ ] **Step 3: Update `packages/plugin-wiki/package.json`**

Change the `build` script from:
```json
"build": "tsup src/index.ts --format cjs --dts --clean && tsup src/commands/wiki/generate.ts src/commands/wiki/update.ts src/commands/wiki/validate.ts --format cjs --dts --out-dir dist/commands/wiki"
```
To:
```json
"build": "tsc -p tsconfig.json"
```

- [ ] **Step 4: Update `packages/plugin-context/package.json`**

Change the `build` script from:
```json
"build": "tsup src/index.ts --format cjs --dts --clean && tsup src/commands/context/index.ts src/commands/context/query.ts src/commands/context/serve.ts --format cjs --dts --out-dir dist/commands/context"
```
To:
```json
"build": "tsc -p tsconfig.json"
```

- [ ] **Step 5: Update `packages/plugin-spec/package.json`**

Change the `build` script from:
```json
"build": "tsup src/index.ts --format cjs --dts --clean && tsup src/commands/spec/sdd.ts src/commands/spec/atdd.ts src/commands/spec/review.ts --format cjs --dts --out-dir dist/commands/spec"
```
To:
```json
"build": "tsc -p tsconfig.json"
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/package.json packages/cli/package.json \
        packages/plugin-wiki/package.json packages/plugin-context/package.json \
        packages/plugin-spec/package.json
git commit -m "build: replace tsup with tsc in all package build scripts"
```

---

## Task 2: Add exclude to all tsconfig.json files

**Files:**
- Modify: `packages/core/tsconfig.json`
- Modify: `packages/cli/tsconfig.json`
- Modify: `packages/plugin-wiki/tsconfig.json`
- Modify: `packages/plugin-context/tsconfig.json`
- Modify: `packages/plugin-spec/tsconfig.json`

Add `"exclude": ["src/**/__tests__/**"]` to each file. Do not change any other field. The resulting file for every package looks like:

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

- [ ] **Step 1: Update `packages/core/tsconfig.json`**

Add `"exclude": ["src/**/__tests__/**"]` after the `"include"` line. Final file:

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

- [ ] **Step 2: Update `packages/cli/tsconfig.json`**

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

- [ ] **Step 3: Update `packages/plugin-wiki/tsconfig.json`**

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

- [ ] **Step 4: Update `packages/plugin-context/tsconfig.json`**

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

- [ ] **Step 5: Update `packages/plugin-spec/tsconfig.json`**

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

- [ ] **Step 6: Commit**

```bash
git add packages/core/tsconfig.json packages/cli/tsconfig.json \
        packages/plugin-wiki/tsconfig.json packages/plugin-context/tsconfig.json \
        packages/plugin-spec/tsconfig.json
git commit -m "build: exclude __tests__ from tsc compilation in all packages"
```

---

## Task 3: Remove tsup from all devDependencies and reinstall

**Files:**
- Modify: `package.json` (root)
- Modify: `packages/core/package.json`
- Modify: `packages/cli/package.json`
- Modify: `packages/plugin-wiki/package.json`
- Modify: `packages/plugin-context/package.json`
- Modify: `packages/plugin-spec/package.json`

- [ ] **Step 1: Remove tsup from root `package.json` devDependencies**

Delete the `"tsup": "^8.3.0"` line from `devDependencies` in the root `package.json`. The resulting `devDependencies` block:

```json
"devDependencies": {
  "@biomejs/biome": "^1.9.0",
  "@changesets/changelog-github": "^0.5.0",
  "@changesets/cli": "^2.27.0",
  "typescript": "^5.6.0",
  "vitest": "^2.1.0"
}
```

- [ ] **Step 2: Remove tsup from `packages/core/package.json` devDependencies**

Delete `"tsup": "^8.3.0"` from `devDependencies`. Resulting `devDependencies`:

```json
"devDependencies": {
  "typescript": "^5.6.0",
  "vitest": "^2.1.0"
}
```

- [ ] **Step 3: Remove tsup from `packages/cli/package.json` devDependencies**

Delete `"tsup": "^8.3.0"` from `devDependencies`. Resulting `devDependencies`:

```json
"devDependencies": {
  "typescript": "^5.6.0",
  "vitest": "^2.1.0"
}
```

- [ ] **Step 4: Remove tsup from `packages/plugin-wiki/package.json` devDependencies**

Delete `"tsup": "^8.3.0"` from `devDependencies`. Resulting `devDependencies`:

```json
"devDependencies": {
  "typescript": "^5.6.0",
  "vitest": "^2.1.0"
}
```

- [ ] **Step 5: Remove tsup from `packages/plugin-context/package.json` devDependencies**

Delete `"tsup": "^8.3.0"` from `devDependencies`. Resulting `devDependencies`:

```json
"devDependencies": {
  "typescript": "^5.6.0",
  "vitest": "^2.1.0"
}
```

- [ ] **Step 6: Remove tsup from `packages/plugin-spec/package.json` devDependencies**

Delete `"tsup": "^8.3.0"` from `devDependencies`. Resulting `devDependencies`:

```json
"devDependencies": {
  "typescript": "^5.6.0",
  "vitest": "^2.1.0"
}
```

- [ ] **Step 7: Run yarn install to update lockfile and remove tsup**

```bash
yarn install
```

Expected: lockfile updated, no errors. `node_modules/tsup` directory should no longer exist.

Verify:
```bash
ls node_modules/tsup 2>/dev/null || echo "tsup removed"
```

Expected output: `tsup removed`

- [ ] **Step 8: Commit**

```bash
git add package.json packages/core/package.json packages/cli/package.json \
        packages/plugin-wiki/package.json packages/plugin-context/package.json \
        packages/plugin-spec/package.json yarn.lock
git commit -m "build: remove tsup from all devDependencies"
```

---

## Task 4: Final verification

- [ ] **Step 1: Clear stale tsup dist artifacts**

```bash
rm -rf packages/core/dist packages/cli/dist \
       packages/plugin-wiki/dist packages/plugin-context/dist \
       packages/plugin-spec/dist
```

This ensures the verification build starts clean with no artifacts from the previous tsup output format.

- [ ] **Step 2: Full workspace build**

```bash
yarn build
```

Expected: all 5 packages build with zero errors. Each package prints tsc output similar to:
```
packages/core: tsc -p tsconfig.json
packages/plugin-wiki: tsc -p tsconfig.json
...
Done in Xs
```

- [ ] **Step 3: Verify dist structure — no __tests__ directories**

```bash
find packages/*/dist -name "__tests__" -type d
```

Expected: no output (empty result). If any `__tests__/` directories appear, the `exclude` in `tsconfig.json` was not applied correctly.

- [ ] **Step 4: Verify dist structure — plugin commands are in correct subdirectory**

```bash
ls packages/plugin-wiki/dist/commands/wiki/
ls packages/plugin-context/dist/commands/context/
ls packages/plugin-spec/dist/commands/spec/
```

Expected output for `plugin-wiki`:
```
generate.d.ts  generate.d.ts.map  generate.js  generate.js.map
update.d.ts    update.d.ts.map    update.js    update.js.map
validate.d.ts  validate.d.ts.map  validate.js  validate.js.map
```

- [ ] **Step 5: Run full test suite**

```bash
yarn test
```

Expected: all 14 tests pass across 5 packages (core: 4, plugin-wiki: 3, plugin-context: 3, plugin-spec: 3, cli: 1).

- [ ] **Step 6: Run typecheck**

```bash
yarn typecheck
```

Expected: exits 0, no errors.

- [ ] **Step 7: Run lint**

```bash
yarn lint
```

Expected: `Checked N files. No fixes applied.` with exit 0.

- [ ] **Step 8: Verify CLI commands**

```bash
node packages/cli/bin/run.js --help
node packages/cli/bin/run.js wiki --help
node packages/cli/bin/run.js context --help
node packages/cli/bin/run.js spec --help
```

Expected: `--help` shows all 9 commands accessible across the 3 topics (wiki: generate/update/validate, context: index/query/serve, spec: sdd/atdd/review).

- [ ] **Step 9: Verify tsup is fully removed**

```bash
grep -r "tsup" packages/*/package.json package.json
```

Expected: no output.

```bash
ls node_modules/tsup 2>/dev/null || echo "tsup not installed"
```

Expected: `tsup not installed`

- [ ] **Step 10: Commit**

```bash
git add .
git commit -m "build: verify tsc migration complete — all checks passing"
```

If working tree is clean (nothing changed in verification), skip this commit and proceed.
