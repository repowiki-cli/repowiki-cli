# Wiki CRUD Consistency Design

**Date:** 2026-05-13  
**Status:** Approved  
**Scope:** `packages/plugin-wiki`

---

## Problem Statement

The wiki system has a structural inconsistency in file discovery across its three pipeline operations:

| Command | File discovery method | Monorepo coverage |
|---|---|---|
| `wiki:generate` | `analyzeWithFileMap()` | Only `packages/*` |
| `wiki:update` | `analyzeWithFileMap()` | Only `packages/*` |
| `wiki:validate` | `discoverFiles()` | **All files** ← inconsistent |

This causes two concrete bugs:

1. **False "new" reports**: `wiki:validate` finds files (e.g., `scripts/*.js`) that `wiki:generate` and `wiki:update` would never process. After those files are deleted, `wiki:validate` says "wiki is up to date"—but from the user's perspective, a file that needed attention just silently disappeared.

2. **Incomplete wiki coverage in monorepos**: Source files outside `packages/` (e.g., `scripts/`, `bin/`, root-level config files) are never included in the wiki, even though non-monorepo projects have full coverage of all source files.

---

## Goals

- All three pipeline operations operate on the **same set of files**.
- `wiki:generate` and `wiki:update` cover **all** source files in a repo, including those outside `packages/` in a monorepo.
- Deleting a source file that was tracked in the wiki causes `wiki:validate` to report "deleted" and `wiki:update` to remove the wiki page and clean up empty directories.
- No new abstractions or node types introduced.

## Non-Goals

- Changing manifest format or version.
- Changing the LLM summarization logic.
- Supporting non-TypeScript/JavaScript source files.

---

## Architecture

### Layer 1 — TypeScriptAnalyzer: Full Coverage in Monorepos

**File:** `packages/plugin-wiki/src/analyzers/typescript/TypeScriptAnalyzer.ts`

#### Root cause

`analyze()` in monorepo mode only processes files under detected `packages/XX/` directories. Files outside those directories ("loose files") are silently dropped.

#### Fix in `analyze()`

After building package nodes, collect files not belonging to any package and process them via `buildDirectoryTree('', '', looseFiles, repoPath)`. The resulting nodes are appended to `root.children` alongside the package nodes.

```
Before (monorepo):
  root.children = [pkg-cli, pkg-core, pkg-plugin-wiki, ...]

After (monorepo):
  root.children = [pkg-cli, pkg-core, pkg-plugin-wiki, ..., scripts/, bin/, ...]
```

For a loose file `scripts/check-workspace-refs.js`:
- Node path: `scripts/check-workspace-refs`
- Wiki path: `{outputPath}/scripts/check-workspace-refs.md`

This is collision-free in the common case: package nodes use their npm short names (e.g., `core`, `plugin-wiki`, `repowiki-cli`) as prefixes, while loose files use their repo-relative paths directly (e.g., `scripts/...`). A theoretical collision exists if a package has a short name that matches a top-level directory containing loose files (e.g., a package named `scripts` and a `scripts/` directory at repo root). In this scenario both would attempt to use the same `rawFile` keys in `_lastFileMap`, causing the second set of entries to silently overwrite the first. This edge case is a **known limitation** — such naming would be an unusual repo layout and is out of scope for this design.

#### Fixes in `buildDirectoryTree` and `groupIntoTree`

Both methods hard-code a `${parentPath}/` prefix in node path and `dirPath` construction, which breaks when `parentPath` is empty (produces a leading `/`). Two targeted fixes:

**`buildDirectoryTree`** — node path construction (line ~150 in current source; the `dirKeyPrefix ? ... : f` guard on line ~147 is already correct and unchanged):
```ts
// Before
const nodePath = `${parentPath}/${noExt}`.replace(/\\/g, '/');

// After
const nodePath = (parentPath ? `${parentPath}/${noExt}` : noExt).replace(/\\/g, '/');
```

**`groupIntoTree`** — `rel` calculation and `dirPath` construction:
```ts
// Before
rel: m.nodePath.slice(parentPath.length + 1),
// ...
const dirPath = `${parentPath}/${seg}`;

// After
rel: parentPath ? m.nodePath.slice(parentPath.length + 1) : m.nodePath,
// ...
const dirPath = parentPath ? `${parentPath}/${seg}` : seg;
```

These three line-level fixes are the complete change needed to support empty `parentPath`. Note: the existing non-monorepo code path passes `projectName` as `parentPath` (never empty), so this bug only manifests in the new loose-files call being introduced here — it is a latent bug, not a regression fix for existing behavior.

---

### Layer 2 — ValidatePipeline: Unified File Discovery

**File:** `packages/plugin-wiki/src/pipeline/ValidatePipeline.ts`

#### Fix

Replace `analyzer.discoverFiles(repoPath)` with `analyzer.analyzeWithFileMap(repoPath)`. Use `fileMap.keys()` as the authoritative current file set for "new" detection.

```ts
// Before
const currentFiles = await analyzer.discoverFiles(repoPath);
// ...
for (const file of currentFiles) {
  if (!manifest.files[file]) newFiles.push(file);
}

// After
const { fileMap } = await analyzer.analyzeWithFileMap(repoPath);
// ...
for (const file of fileMap.keys()) {
  if (!manifest.files[file]) newFiles.push(file);
}
```

**Performance note:** `analyzeWithFileMap()` parses ASTs for every source file to extract exports, which is heavier than `discoverFiles()` (glob + filter only). This tradeoff is intentional: correctness (validate operates on the exact same file set as generate/update) takes priority over the marginal performance cost, and `wiki:validate` already performs N hash computations (one per manifest entry) so it is not a zero-cost operation. A future optimization could introduce a `discoverAnalyzedFiles()` method that runs the tree-building logic without AST parsing, but this is out of scope here.

**Backward compatibility (v1 manifests):** `ValidatePipeline` loads `AnyManifest` (v1 or v2) and accesses only `manifest.files`, which has the same structure in both versions. The change from `discoverFiles()` to `analyzeWithFileMap()` does not affect v1 manifest compatibility — the validate logic functions correctly with either version.

The stale/deleted detection loop (iterating `manifest.files` and trying `computeHash`) is unchanged — it already correctly identifies:
- **stale**: file exists on disk but hash differs from manifest
- **deleted**: file in manifest but no longer on disk (`computeHash` throws ENOENT)

---

### Layer 3 — UpdatePipeline + LocalMarkdownBackend: Empty Directory Cleanup

**Files:**
- `packages/plugin-wiki/src/pipeline/UpdatePipeline.ts`
- `packages/plugin-wiki/src/backends/LocalMarkdownBackend.ts`

#### Problem

When a source file is deleted, `wiki:update` correctly removes the wiki markdown file. But if that was the only file in its directory (e.g., `.repowiki/scripts/check-workspace-refs.md` was the only file in `.repowiki/scripts/`), the now-empty `.repowiki/scripts/` directory remains on disk.

#### Fix in `LocalMarkdownBackend`

Add a `pruneEmptyDirs(dir: string, stopAt: string): Promise<void>` method that walks up the directory tree from `dir`, deleting each directory that is empty, stopping at `stopAt` (the outputPath boundary). `stopAt` is passed explicitly as a parameter (rather than using `this.outputPath`) to make the boundary testable in isolation.

**Required import additions:** `readdir` and `rmdir` from `node:fs/promises` (not currently imported).

```ts
async pruneEmptyDirs(dir: string, stopAt: string): Promise<void> {
  const resolvedStop = path.resolve(stopAt);
  let current = path.resolve(dir);
  // Invariant: callers must pass a `dir` that is a descendant of `stopAt`.
  // When `current === resolvedStop` the loop exits immediately without deleting anything.
  while (current.startsWith(resolvedStop) && current !== resolvedStop) {
    const entries = await readdir(current).catch(() => null);
    if (entries === null || entries.length > 0) break;
    await rmdir(current); // throws on failure — intentionally propagates to abort the update before manifest is saved
    current = path.dirname(current);
  }
}
```

**Failure mode:** If `rmdir` throws (e.g., permission error), the error propagates out of `UpdatePipeline.run()` before Step 11 saves the manifest. The manifest retains the deleted entry, so the next `wiki:validate` will report "deleted" again. This is safe and idempotent — the user can re-run `wiki:update` to complete the operation.

#### Fix in `UpdatePipeline` Step 9

After `backend.delete(absWikiPath)`, call `backend.pruneEmptyDirs(nodePath.dirname(absWikiPath), outputPath)`. (`nodePath` is already imported as `import * as nodePath from 'node:path'` in `UpdatePipeline.ts`.)

---

### Layer 4 — CLAUDE.md + Changeset

#### CLAUDE.md

Update the `plugin-wiki Internal Structure` section to note:
- Analyzer covers all source files in monorepos, including files outside `packages/`
- `ValidatePipeline` and `UpdatePipeline`/`GeneratePipeline` all use `analyzeWithFileMap()` as the single source of truth for file discovery

#### Changeset

`plugin-wiki` minor bump. Breaking behavior change: monorepo projects now generate wiki pages for source files outside `packages/` (e.g., `scripts/`, `bin/`, root-level `.ts`/`.js` files). Existing wikis should be regenerated with `wiki:generate` after upgrading.

---

## Data Flow: CRUD After This Fix

| Operation | Source file state | Wiki state | Expected outcome |
|---|---|---|---|
| **C** Generate/Update | New file, not in manifest | No wiki page | File appears in `validate` as "new"; `update` creates wiki page + adds to manifest |
| **R** Validate | File unchanged | Wiki up to date | `validate` exits 0: "wiki is up to date" |
| **U** Update | File changed (hash differs) | Wiki page stale | `validate` reports "stale"; `update` re-summarizes + rewrites wiki page |
| **D** Update | File deleted | Wiki page orphaned | `validate` reports "deleted"; `update` removes wiki page + prunes empty dirs + removes from manifest |

---

## File Change Summary

| File | Change type | Description |
|---|---|---|
| `TypeScriptAnalyzer.ts` | Modify | Add loose files handling in `analyze()`; fix empty-parentPath in `buildDirectoryTree` and `groupIntoTree` |
| `ValidatePipeline.ts` | Modify | Use `analyzeWithFileMap()` instead of `discoverFiles()` |
| `LocalMarkdownBackend.ts` | Modify | Add `pruneEmptyDirs()` method |
| `UpdatePipeline.ts` | Modify | Call `pruneEmptyDirs()` after wiki file deletion |
| `CLAUDE.md` | Modify | Update architecture notes |
| `.changeset/*.md` | Add | `plugin-wiki` minor bump with breaking change note |

---

## Test Coverage

### TypeScriptAnalyzer

- **New**: Monorepo project with loose files (files outside `packages/`) → `fileMap` includes those files with correct paths
- **New**: Single file directly at repo root (no subdirectory) → node path has no leading slash
- **New**: Multiple loose files in same subdirectory → grouped into directory node correctly
- **Existing**: Monorepo with only package files → behavior unchanged

### ValidatePipeline

- **New**: File in `analyzeWithFileMap` but not in manifest → reported as "new"
- **New**: File in manifest but not on disk → reported as "deleted"
- **New**: File in manifest with changed hash → reported as "stale"
- **New**: Loose file (outside `packages/`) deleted after being shown as "new" → never shows as "new" since validate now uses analyzeWithFileMap (consistent with what generate would actually process)
- **Existing**: All-clean state → "wiki is up to date"

### UpdatePipeline

- **New**: Source file deleted → wiki file removed, empty parent directory pruned
- **Existing**: Stale files re-summarized → unchanged behavior
- **Existing**: New files summarized → unchanged behavior

### LocalMarkdownBackend

- **New**: `pruneEmptyDirs` removes single empty directory
- **New**: `pruneEmptyDirs` removes chain of empty directories up to `outputPath`
- **New**: `pruneEmptyDirs` stops at non-empty directory
- **New**: `pruneEmptyDirs` does not remove `outputPath` itself
