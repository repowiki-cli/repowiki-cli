# Wiki CRUD Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix wiki CRUD inconsistency — extend TypeScriptAnalyzer to cover all source files in monorepos, unify file discovery across all pipelines, and clean up empty directories after wiki file deletion.

**Architecture:** Three targeted changes: (1) analyzer loops loose files through the same tree-builder as packages, requiring empty-parentPath support in two private methods; (2) ValidatePipeline switches from `discoverFiles()` to `analyzeWithFileMap()` for consistency; (3) LocalMarkdownBackend gains `pruneEmptyDirs()` called by UpdatePipeline after each wiki file deletion.

**Tech Stack:** TypeScript, Vitest, Node.js `fs/promises` (`readdir`, `rmdir`), fast-glob (already in use).

**Spec:** `docs/superpowers/specs/2026-05-13-wiki-crud-consistency-design.md`

---

## File Change Map

| File | Action | Responsibility |
|---|---|---|
| `packages/plugin-wiki/src/analyzers/typescript/TypeScriptAnalyzer.ts` | Modify | Fix empty-parentPath in `buildDirectoryTree`/`groupIntoTree`; add loose files to `analyze()` |
| `packages/plugin-wiki/src/analyzers/typescript/__tests__/TypeScriptAnalyzer.test.ts` | Modify | Add loose-files tests; relax one existing assertion |
| `packages/plugin-wiki/src/pipeline/ValidatePipeline.ts` | Modify | Switch `discoverFiles()` → `analyzeWithFileMap()` |
| `packages/plugin-wiki/src/pipeline/__tests__/pipeline.test.ts` | Modify | Add "deleted" test; update "exits 0" test setup |
| `packages/plugin-wiki/src/backends/LocalMarkdownBackend.ts` | Modify | Add `pruneEmptyDirs()` with `readdir`/`rmdir` imports |
| `packages/plugin-wiki/src/backends/__tests__/backends.test.ts` | Modify | Add four `pruneEmptyDirs` tests |
| `packages/plugin-wiki/src/pipeline/UpdatePipeline.ts` | Modify | Call `backend.pruneEmptyDirs()` in Step 9 after each wiki deletion |
| `packages/plugin-wiki/src/pipeline/__tests__/UpdatePipeline.test.ts` | Modify | Add empty-dir pruning test |
| `CLAUDE.md` | Modify | Update architecture notes for file discovery |
| `.changeset/wiki-crud-consistency.md` | Create | `plugin-wiki` minor bump |

---

## Task 1: TypeScriptAnalyzer — empty-parentPath fixes + loose files

**Files:**
- Modify: `packages/plugin-wiki/src/analyzers/typescript/TypeScriptAnalyzer.ts`
- Modify: `packages/plugin-wiki/src/analyzers/typescript/__tests__/TypeScriptAnalyzer.test.ts`

These tests will **fail** before implementation because the analyzer currently drops files outside `packages/` in monorepos.

- [ ] **Step 1.1: Add imports and loose-files describe block to TypeScriptAnalyzer.test.ts**

Replace the top of the file (lines 1-3) with:

```ts
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TypeScriptAnalyzer } from '../TypeScriptAnalyzer.js';
```

- [ ] **Step 1.2: Add the loose-files test suite at the bottom of TypeScriptAnalyzer.test.ts**

Append after the last line of the file:

```ts
describe('TypeScriptAnalyzer — monorepo with loose files', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'repowiki-loose-'));
    await writeFile(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'my-project' }));
    await mkdir(path.join(tmpDir, 'packages/core/src'), { recursive: true });
    await writeFile(
      path.join(tmpDir, 'packages/core/package.json'),
      JSON.stringify({ name: '@my/core' }),
    );
    await writeFile(
      path.join(tmpDir, 'packages/core/src/index.ts'),
      'export interface Foo { bar: string }',
    );
    await mkdir(path.join(tmpDir, 'scripts'), { recursive: true });
    await writeFile(path.join(tmpDir, 'scripts/build.js'), '// build script');
    await writeFile(path.join(tmpDir, 'setup.ts'), 'export const setup = true;');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('fileMap includes loose files outside packages/', async () => {
    const analyzer = new TypeScriptAnalyzer();
    const { fileMap } = await analyzer.analyzeWithFileMap(tmpDir);
    expect(fileMap.has('scripts/build.js')).toBe(true);
    expect(fileMap.has('setup.ts')).toBe(true);
    expect(fileMap.has('packages/core/src/index.ts')).toBe(true);
  });

  it('loose file node paths have no leading slash', async () => {
    const analyzer = new TypeScriptAnalyzer();
    const { fileMap } = await analyzer.analyzeWithFileMap(tmpDir);
    const buildNode = fileMap.get('scripts/build.js');
    expect(buildNode?.path).toBe('scripts/build');
    const setupNode = fileMap.get('setup.ts');
    expect(setupNode?.path).toBe('setup');
  });

  it('loose files in a subdirectory are grouped into a directory node on root', async () => {
    const analyzer = new TypeScriptAnalyzer();
    const { root } = (await analyzer.analyzeWithFileMap(tmpDir)) as {
      root: import('../../types.js').AnalyzedNode;
      fileMap: Map<string, import('../../types.js').AnalyzedNode>;
    };
    const scriptsNode = root.children.find((c) => c.path === 'scripts');
    expect(scriptsNode).toBeDefined();
    expect(scriptsNode?.type).toBe('directory');
  });

  it('package nodes and loose-file nodes coexist as root.children', async () => {
    const analyzer = new TypeScriptAnalyzer();
    const { root } = (await analyzer.analyzeWithFileMap(tmpDir)) as {
      root: import('../../types.js').AnalyzedNode;
      fileMap: Map<string, import('../../types.js').AnalyzedNode>;
    };
    const coreNode = root.children.find((c) => c.type === 'package' && c.path === 'core');
    expect(coreNode).toBeDefined();
    const scriptsNode = root.children.find((c) => c.path === 'scripts');
    expect(scriptsNode).toBeDefined();
  });
});
```

- [ ] **Step 1.3: Run tests to confirm new tests fail**

```bash
yarn workspace @repowiki/plugin-wiki vitest run src/analyzers/typescript/__tests__/TypeScriptAnalyzer.test.ts
```

Expected: 4 new tests FAIL (`fileMap.has('scripts/build.js')` returns false, etc.). Existing tests pass.

- [ ] **Step 1.4: Fix `buildDirectoryTree` — empty-parentPath node path**

In `packages/plugin-wiki/src/analyzers/typescript/TypeScriptAnalyzer.ts`, find line ~150:

```ts
      const nodePath = `${parentPath}/${noExt}`.replace(/\\/g, '/');
```

Replace with:

```ts
      const nodePath = (parentPath ? `${parentPath}/${noExt}` : noExt).replace(/\\/g, '/');
```

- [ ] **Step 1.5: Fix `groupIntoTree` — `rel` calculation**

Find line ~167 (inside the `const relative = modules.map` block):

```ts
      rel: m.nodePath.slice(parentPath.length + 1),
```

Replace with:

```ts
      rel: parentPath ? m.nodePath.slice(parentPath.length + 1) : m.nodePath,
```

- [ ] **Step 1.6: Fix `groupIntoTree` — `dirPath` construction**

Find line ~195 (inside the else branch of the `if (group.length === 1 && group[0].rel === seg)` check):

```ts
        const dirPath = `${parentPath}/${seg}`;
```

Replace with:

```ts
        const dirPath = parentPath ? `${parentPath}/${seg}` : seg;
```

- [ ] **Step 1.7: Add loose-files handling in `analyze()`**

Find the `if (packages.length > 0)` block (lines ~72-95). After the `for (const pkg of packages)` loop and before the closing `}`, add:

```ts
    if (packages.length > 0) {
      for (const pkg of packages) {
        const pkgFiles = files.filter((f) => f.startsWith(`${pkg.dirKey}/`));
        const pkgNode: AnalyzedNode = {
          type: 'package',
          path: pkg.shortPath,
          title: pkg.name,
          summary: '',
          exports: [],
          children: [],
        };
        pkgNode.children = await this.buildDirectoryTree(
          pkg.shortPath,
          pkg.dirKey,
          pkgFiles,
          repoPath,
        );
        root.children.push(pkgNode);
      }
      // Files outside all package directories (loose files at repo root level)
      const looseFiles = files.filter(
        (f) => !packages.some((pkg) => f.startsWith(`${pkg.dirKey}/`)),
      );
      if (looseFiles.length > 0) {
        const looseNodes = await this.buildDirectoryTree('', '', looseFiles, repoPath);
        root.children.push(...looseNodes);
      }
    } else {
      root.children = await this.buildDirectoryTree(projectName, '', files, repoPath);
    }
```

- [ ] **Step 1.8: Update the fragile "all root.children are packages" assertion**

In `TypeScriptAnalyzer.test.ts`, find the test (line ~33):

```ts
    it('root has package children for monorepo', async () => {
      const analyzer = new TypeScriptAnalyzer();
      const [root] = (await analyzer.analyze(REPO_ROOT)) as import('../../types.js').AnalyzedNode[];
      expect(root.children.every((c) => c.type === 'package')).toBe(true);
    });
```

Replace the assertion with:

```ts
    it('root has package children for monorepo', async () => {
      const analyzer = new TypeScriptAnalyzer();
      const [root] = (await analyzer.analyze(REPO_ROOT)) as import('../../types.js').AnalyzedNode[];
      expect(root.children.some((c) => c.type === 'package')).toBe(true);
    });
```

- [ ] **Step 1.9: Run all TypeScriptAnalyzer tests to confirm all pass**

```bash
yarn workspace @repowiki/plugin-wiki vitest run src/analyzers/typescript/__tests__/TypeScriptAnalyzer.test.ts
```

Expected: All tests pass, including the 4 new loose-files tests.

- [ ] **Step 1.10: Run full test suite to check for regressions**

```bash
yarn workspace @repowiki/plugin-wiki test
```

Expected: All tests pass.

- [ ] **Step 1.11: Commit**

```bash
git add packages/plugin-wiki/src/analyzers/typescript/TypeScriptAnalyzer.ts \
        packages/plugin-wiki/src/analyzers/typescript/__tests__/TypeScriptAnalyzer.test.ts
git commit -m "feat(plugin-wiki): extend TypeScriptAnalyzer to cover loose files in monorepos"
```

---

## Task 2: ValidatePipeline — unified file discovery

**Files:**
- Modify: `packages/plugin-wiki/src/pipeline/ValidatePipeline.ts`
- Modify: `packages/plugin-wiki/src/pipeline/__tests__/pipeline.test.ts`

Note: After Task 1, `discoverFiles()` and `analyzeWithFileMap()` return the same file set. This task's behavioral change is subtle (future-proofing consistency) but the "deleted" regression test and "exits 0" test update are included to complete the spec coverage.

- [ ] **Step 2.1: Add "deleted" test to pipeline.test.ts**

In `packages/plugin-wiki/src/pipeline/__tests__/pipeline.test.ts`, inside the `describe('ValidatePipeline', ...)` block, add the following test after the existing "exits 1 and reports stale" test:

```ts
  it('exits 1 and reports deleted when a manifest file is missing from disk', async () => {
    const mgr = new ManifestManager(outputDir);
    const { TypeScriptAnalyzer } = await import(
      '../../analyzers/typescript/TypeScriptAnalyzer.js'
    );
    const analyzer = new TypeScriptAnalyzer();
    const { fileMap } = await analyzer.analyzeWithFileMap(tmpDir);
    const manifestFiles: Record<string, { hash: string; wikiPath: string }> = {};
    for (const f of fileMap.keys()) {
      const hash = await mgr.computeHash(path.join(tmpDir, f));
      manifestFiles[f] = { hash, wikiPath: '' };
    }
    await mgr.save({
      version: 1,
      generatedAt: new Date().toISOString(),
      provider: 'test',
      files: manifestFiles,
    });

    const { unlink } = await import('node:fs/promises');
    await unlink(path.join(tmpDir, 'src/utils.ts'));

    const pipeline = new ValidatePipeline();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await pipeline.run({ repoPath: tmpDir, outputPath: outputDir });
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stdoutSpy.mock.calls.some((args) => String(args[0]).includes('deleted'))).toBe(true);
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
  });
```

- [ ] **Step 2.2: Update "exits 0" test to use analyzeWithFileMap for manifest setup**

In `pipeline.test.ts`, find the test "exits 0 when manifest matches current source files" (line ~150). Replace the manifest-building loop to use `analyzeWithFileMap` instead of `discoverFiles`:

```ts
  it('exits 0 when manifest matches current source files', async () => {
    const mgr = new ManifestManager(outputDir);
    const { TypeScriptAnalyzer } = await import(
      '../../analyzers/typescript/TypeScriptAnalyzer.js'
    );
    const analyzer = new TypeScriptAnalyzer();
    const { fileMap } = await analyzer.analyzeWithFileMap(tmpDir);
    const manifestFiles: Manifest['files'] = {};
    for (const f of fileMap.keys()) {
      const hash = await mgr.computeHash(path.join(tmpDir, f));
      manifestFiles[f] = { hash, wikiPath: '' };
    }
    await mgr.save({
      version: 1,
      generatedAt: new Date().toISOString(),
      provider: 'test',
      files: manifestFiles,
    });

    const pipeline = new ValidatePipeline();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    await pipeline.run({ repoPath: tmpDir, outputPath: outputDir });
    expect(exitSpy).toHaveBeenCalledWith(0);
    exitSpy.mockRestore();
  });
```

- [ ] **Step 2.3: Run ValidatePipeline tests to confirm they pass before code change**

```bash
yarn workspace @repowiki/plugin-wiki vitest run src/pipeline/__tests__/pipeline.test.ts
```

Expected: All tests pass (the "deleted" test already passes with existing logic).

- [ ] **Step 2.4: Switch ValidatePipeline to use analyzeWithFileMap**

In `packages/plugin-wiki/src/pipeline/ValidatePipeline.ts`, replace the entire `run()` method body with:

```ts
  async run(opts: ValidateOptions): Promise<void> {
    const { repoPath, outputPath } = opts;
    const mgr = new ManifestManager(outputPath);

    const manifest = await mgr.load();
    if (!manifest) {
      process.stdout.write('Wiki not found. Run `repowiki wiki generate` first.\n');
      process.exit(1);
      return;
    }

    const analyzer = new TypeScriptAnalyzer();
    const { fileMap } = await analyzer.analyzeWithFileMap(repoPath);

    const stale: string[] = [];
    const newFiles: string[] = [];
    const deleted: string[] = [];

    for (const [file, entry] of Object.entries(manifest.files)) {
      const absPath = path.join(repoPath, file);
      try {
        const hash = await mgr.computeHash(absPath);
        if (hash !== entry.hash) stale.push(file);
      } catch {
        deleted.push(file);
      }
    }

    for (const file of fileMap.keys()) {
      if (!manifest.files[file]) newFiles.push(file);
    }

    if (stale.length === 0 && newFiles.length === 0 && deleted.length === 0) {
      process.stdout.write('wiki is up to date\n');
      process.exit(0);
    }

    if (stale.length > 0) {
      process.stdout.write(`stale (${stale.length}):\n${stale.map((f) => `  ${f}`).join('\n')}\n`);
    }
    if (newFiles.length > 0) {
      process.stdout.write(
        `new (${newFiles.length}):\n${newFiles.map((f) => `  ${f}`).join('\n')}\n`,
      );
    }
    if (deleted.length > 0) {
      process.stdout.write(
        `deleted (${deleted.length}):\n${deleted.map((f) => `  ${f}`).join('\n')}\n`,
      );
    }
    process.exit(1);
  }
```

- [ ] **Step 2.5: Run tests to confirm all pass**

```bash
yarn workspace @repowiki/plugin-wiki vitest run src/pipeline/__tests__/pipeline.test.ts
```

Expected: All tests pass.

- [ ] **Step 2.6: Run full test suite to check for regressions**

```bash
yarn workspace @repowiki/plugin-wiki test
```

Expected: All tests pass.

- [ ] **Step 2.7: Commit**

```bash
git add packages/plugin-wiki/src/pipeline/ValidatePipeline.ts \
        packages/plugin-wiki/src/pipeline/__tests__/pipeline.test.ts
git commit -m "fix(plugin-wiki): use analyzeWithFileMap in ValidatePipeline for consistent file discovery"
```

---

## Task 3: LocalMarkdownBackend — pruneEmptyDirs

**Files:**
- Modify: `packages/plugin-wiki/src/backends/LocalMarkdownBackend.ts`
- Modify: `packages/plugin-wiki/src/backends/__tests__/backends.test.ts`

These tests **fail** before implementation because `pruneEmptyDirs` does not exist yet.

- [ ] **Step 3.1: Add stat import and pruneEmptyDirs tests to backends.test.ts**

At the top of `backends.test.ts`, add `stat` to the import from `node:fs/promises`:

```ts
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Manifest } from '../../types.js';
import { LocalMarkdownBackend } from '../LocalMarkdownBackend.js';
import { ManifestManager } from '../ManifestManager.js';
```

Then append the following `describe` block at the end of the file:

```ts
describe('LocalMarkdownBackend — pruneEmptyDirs', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'repowiki-prune-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('removes a single empty directory', async () => {
    const emptyDir = path.join(tmpDir, 'empty');
    await mkdir(emptyDir, { recursive: true });
    const backend = new LocalMarkdownBackend(tmpDir);
    await backend.pruneEmptyDirs(emptyDir, tmpDir);
    await expect(stat(emptyDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('removes a chain of empty parent directories up to stopAt', async () => {
    const deepDir = path.join(tmpDir, 'a', 'b', 'c');
    await mkdir(deepDir, { recursive: true });
    const backend = new LocalMarkdownBackend(tmpDir);
    await backend.pruneEmptyDirs(deepDir, tmpDir);
    await expect(stat(path.join(tmpDir, 'a'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('stops at a non-empty directory', async () => {
    const parentDir = path.join(tmpDir, 'parent');
    const emptyChild = path.join(parentDir, 'empty-child');
    const sibling = path.join(parentDir, 'sibling.md');
    await mkdir(emptyChild, { recursive: true });
    await writeFile(sibling, 'content');
    const backend = new LocalMarkdownBackend(tmpDir);
    await backend.pruneEmptyDirs(emptyChild, tmpDir);
    await expect(stat(emptyChild)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(stat(parentDir)).resolves.toBeTruthy(); // parent kept because sibling.md remains
  });

  it('does not remove stopAt itself', async () => {
    const backend = new LocalMarkdownBackend(tmpDir);
    await backend.pruneEmptyDirs(tmpDir, tmpDir); // dir === stopAt
    await expect(stat(tmpDir)).resolves.toBeTruthy();
  });
});
```

- [ ] **Step 3.2: Run tests to confirm all 4 new tests fail**

```bash
yarn workspace @repowiki/plugin-wiki vitest run src/backends/__tests__/backends.test.ts
```

Expected: 4 new tests FAIL with "backend.pruneEmptyDirs is not a function".

- [ ] **Step 3.3: Add readdir and rmdir imports to LocalMarkdownBackend.ts**

In `packages/plugin-wiki/src/backends/LocalMarkdownBackend.ts`, replace line 1:

```ts
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
```

Wait — `rename` is in ManifestManager, not here. Check the current import:

Current line 1 of `LocalMarkdownBackend.ts`:
```ts
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
```

Replace with:
```ts
import { mkdir, readFile, readdir, rmdir, unlink, writeFile } from 'node:fs/promises';
```

- [ ] **Step 3.4: Implement pruneEmptyDirs in LocalMarkdownBackend.ts**

Add the following method after the `delete()` method (before the `query()` method):

```ts
  async pruneEmptyDirs(dir: string, stopAt: string): Promise<void> {
    const resolvedStop = path.resolve(stopAt);
    let current = path.resolve(dir);
    // Invariant: callers pass a `dir` that is a descendant of `stopAt`.
    // When `current === resolvedStop` the loop exits immediately.
    while (current.startsWith(resolvedStop) && current !== resolvedStop) {
      const entries = await readdir(current).catch(() => null);
      if (entries === null || entries.length > 0) break;
      await rmdir(current);
      current = path.dirname(current);
    }
  }
```

- [ ] **Step 3.5: Run tests to confirm all 4 pruneEmptyDirs tests pass**

```bash
yarn workspace @repowiki/plugin-wiki vitest run src/backends/__tests__/backends.test.ts
```

Expected: All tests pass.

- [ ] **Step 3.6: Run full test suite**

```bash
yarn workspace @repowiki/plugin-wiki test
```

Expected: All tests pass.

- [ ] **Step 3.7: Commit**

```bash
git add packages/plugin-wiki/src/backends/LocalMarkdownBackend.ts \
        packages/plugin-wiki/src/backends/__tests__/backends.test.ts
git commit -m "feat(plugin-wiki): add pruneEmptyDirs to LocalMarkdownBackend"
```

---

## Task 4: UpdatePipeline — call pruneEmptyDirs after wiki file deletion

**Files:**
- Modify: `packages/plugin-wiki/src/pipeline/UpdatePipeline.ts`
- Modify: `packages/plugin-wiki/src/pipeline/__tests__/UpdatePipeline.test.ts`

This test **fails** before implementation because UpdatePipeline doesn't yet call `pruneEmptyDirs`.

- [ ] **Step 4.1: Add the pruneEmptyDirs test to UpdatePipeline.test.ts**

In `packages/plugin-wiki/src/pipeline/__tests__/UpdatePipeline.test.ts`, add the following helper function before the `describe('UpdatePipeline', ...)` block:

```ts
async function createMonorepoFixture(dir: string): Promise<void> {
  await writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'my-project' }));
  await mkdir(path.join(dir, 'packages/core/src'), { recursive: true });
  await writeFile(
    path.join(dir, 'packages/core/package.json'),
    JSON.stringify({ name: '@my/core' }),
  );
  await writeFile(
    path.join(dir, 'packages/core/src/index.ts'),
    'export interface Foo { bar: string }',
  );
  await mkdir(path.join(dir, 'old'), { recursive: true });
  await writeFile(path.join(dir, 'old/legacy.ts'), 'export const LEGACY = true;');
}
```

Then add the following test inside the existing `describe('UpdatePipeline', ...)` block, after the last `it()`:

```ts
  it('prunes empty wiki directories after a loose source file is deleted', async () => {
    const monorepoDir = await makeTmpDir();
    const monorepoOutput = path.join(monorepoDir, '.repowiki');
    try {
      await createMonorepoFixture(monorepoDir);

      await new GeneratePipeline({
        complete: vi.fn().mockResolvedValue('gen summary'),
      } as LLMProvider).run({
        provider: 'openai',
        dryRun: false,
        estimate: false,
        concurrency: 2,
        repoPath: monorepoDir,
        outputPath: monorepoOutput,
        quiet: false,
      });

      const manifestBefore = JSON.parse(
        await readFile(path.join(monorepoOutput, '.manifest.json'), 'utf-8'),
      );
      expect(manifestBefore.files['old/legacy.ts']).toBeDefined();
      const legacyWikiPath = path.resolve(monorepoDir, manifestBefore.files['old/legacy.ts'].wikiPath);
      await readFile(legacyWikiPath); // verify wiki file exists

      await unlink(path.join(monorepoDir, 'old/legacy.ts'));

      await new UpdatePipeline({ complete: vi.fn().mockResolvedValue('updated') } as LLMProvider).run({
        provider: 'openai',
        repoPath: monorepoDir,
        outputPath: monorepoOutput,
        concurrency: 2,
      });

      await expect(readFile(legacyWikiPath)).rejects.toThrow(); // wiki file gone
      await expect(stat(path.dirname(legacyWikiPath))).rejects.toMatchObject({ code: 'ENOENT' }); // empty dir pruned

      const manifestAfter = JSON.parse(
        await readFile(path.join(monorepoOutput, '.manifest.json'), 'utf-8'),
      );
      expect(Object.keys(manifestAfter.files)).not.toContain('old/legacy.ts');
    } finally {
      await rm(monorepoDir, { recursive: true, force: true });
    }
  });
```

Also update the imports at the top of `UpdatePipeline.test.ts` to add `stat` and `unlink`:

```ts
import { mkdir, mkdtemp, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises';
```

And remove the dynamic import inside the existing "deletes wiki file and manifest entry for a deleted source file" test (line ~162):

```ts
// Remove this line:
const { unlink } = await import('node:fs/promises');
```

(It's now redundant since `unlink` is imported statically above.)

- [ ] **Step 4.2: Run the new test to confirm it fails**

```bash
yarn workspace @repowiki/plugin-wiki vitest run src/pipeline/__tests__/UpdatePipeline.test.ts
```

Expected: New test FAILS at `stat(path.dirname(legacyWikiPath))` — the empty directory still exists because `pruneEmptyDirs` is not called yet.

- [ ] **Step 4.3: Call pruneEmptyDirs in UpdatePipeline Step 9**

In `packages/plugin-wiki/src/pipeline/UpdatePipeline.ts`, find Step 9 (lines ~123-129):

```ts
    // Step 9: Delete wiki files for deleted source files
    const backend = new LocalMarkdownBackend(outputPath);
    for (const relPath of deleted) {
      const absWikiPath = nodePath.resolve(repoPath, m.files[relPath].wikiPath);
      await backend.delete(absWikiPath);
      delete m.files[relPath];
    }
```

Replace with:

```ts
    // Step 9: Delete wiki files for deleted source files and prune empty directories
    const backend = new LocalMarkdownBackend(outputPath);
    for (const relPath of deleted) {
      const absWikiPath = nodePath.resolve(repoPath, m.files[relPath].wikiPath);
      await backend.delete(absWikiPath);
      await backend.pruneEmptyDirs(nodePath.dirname(absWikiPath), outputPath);
      delete m.files[relPath];
    }
```

- [ ] **Step 4.4: Run all UpdatePipeline tests to confirm they all pass**

```bash
yarn workspace @repowiki/plugin-wiki vitest run src/pipeline/__tests__/UpdatePipeline.test.ts
```

Expected: All tests pass, including the new pruning test.

- [ ] **Step 4.5: Run full test suite**

```bash
yarn workspace @repowiki/plugin-wiki test
```

Expected: All tests pass.

- [ ] **Step 4.6: Commit**

```bash
git add packages/plugin-wiki/src/pipeline/UpdatePipeline.ts \
        packages/plugin-wiki/src/pipeline/__tests__/UpdatePipeline.test.ts
git commit -m "feat(plugin-wiki): prune empty wiki directories after source file deletion"
```

---

## Task 5: CLAUDE.md update and changeset

**Files:**
- Modify: `CLAUDE.md`
- Create: `.changeset/wiki-crud-consistency.md`

- [ ] **Step 5.1: Update CLAUDE.md architecture section**

In `CLAUDE.md`, find the `GeneratePipeline flow:` paragraph (under `plugin-wiki Internal Structure`). Update the paragraph that describes the pipeline to add a note about file discovery, and update the `analyzers/typescript/TypeScriptAnalyzer.ts` row description in the Key Modules table.

Find the line:
```
  TypeScriptAnalyzer.ts           — implements Analyzer; file discovery (fast-glob + ignore),
                                    monorepo package detection, directory-tree collapse
```

Replace with:
```
  TypeScriptAnalyzer.ts           — implements Analyzer; file discovery (fast-glob + ignore),
                                    monorepo package detection, directory-tree collapse,
                                    loose files (files outside packages/) included via empty-parentPath path
```

Find the line:
```
  ValidatePipeline.ts             — manifest diff; exits 1 when stale/new/deleted files found
```

Replace with:
```
  ValidatePipeline.ts             — manifest diff using analyzeWithFileMap() (same discovery as
                                    generate/update); exits 1 when stale/new/deleted files found
```

- [ ] **Step 5.2: Create changeset**

```bash
yarn changeset
```

When prompted:
- Select `@repowiki/plugin-wiki` (press Space to select, Enter to confirm)
- Choose `minor` (breaking behavior change: monorepo projects now generate wiki pages for files outside `packages/`)
- Enter this summary:

```
wiki:generate and wiki:update now cover all source files in monorepos, including those outside packages/ (e.g. scripts/, bin/, root-level .ts/.js files). wiki:validate now uses analyzeWithFileMap() for consistent file discovery. UpdatePipeline prunes empty directories after wiki file deletion. Existing monorepo wikis should be regenerated with wiki:generate after upgrading.
```

- [ ] **Step 5.3: Run full test suite and typecheck**

```bash
yarn workspace @repowiki/plugin-wiki test && yarn typecheck
```

Expected: All tests pass, no type errors.

- [ ] **Step 5.4: Commit**

```bash
git add CLAUDE.md .changeset/
git commit -m "docs: update CLAUDE.md and add changeset for wiki CRUD consistency fix"
```

---

## Verification Checklist

After all tasks are complete, verify end-to-end behavior manually:

```bash
# Build
yarn build

# In a monorepo with files outside packages/:
# 1. Create a loose file
echo "export const x = 1;" > scripts/test-loose.ts

# 2. Validate — should show "new"
node packages/cli/bin/run.js wiki:validate
# Expected: "new (1): scripts/test-loose.ts"

# 3. Generate — should create wiki page for the loose file
node packages/cli/bin/run.js wiki:generate --provider=dashscope --dry-run
# Expected: scripts/test-loose.md appears in the dry-run list

# 4. Delete the loose file
rm scripts/test-loose.ts

# 5. Validate — should show "deleted" (not "up to date")
node packages/cli/bin/run.js wiki:validate
# Expected (after generate was run): "deleted (1): scripts/test-loose.ts"

# Cleanup
git checkout -- CLAUDE.md  # if you changed it for this test
```
