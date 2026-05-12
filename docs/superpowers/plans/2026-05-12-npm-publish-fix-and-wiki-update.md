# npm Publish Fix + wiki:update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the broken npm publish (all packages had `workspace:*` in deps) by adding a `prepack` guard and implement the `wiki:update` incremental command so the dogfood CI can run successfully.

**Architecture:** Three independent pieces: (1) a `prepack` lifecycle hook in each `package.json` that blocks manual publishes with unresolved workspace refs; (2) a `wiki:update` command backed by `UpdatePipeline` that diffs the manifest against the current source tree, re-summarizes only changed files, and rebuilds affected parent pages; (3) shared extraction of LLM prompt/retry logic into `pipeline/summarize.ts` and markdown rendering into `pipeline/render.ts`.

**Tech Stack:** TypeScript (NodeNext module mode — all relative imports use `.js` extension), Vitest for tests, oclif for the command layer, existing `TypeScriptAnalyzer` / `ManifestManager` / `LocalMarkdownBackend` backends.

---

## File Structure

**Create:**
- `packages/plugin-wiki/src/pipeline/summarize.ts` — `summarizeModule`, `summarizeParent`, `callWithRetry`
- `packages/plugin-wiki/src/pipeline/render.ts` — `renderMarkdown`, `collectAll`
- `packages/plugin-wiki/src/pipeline/UpdatePipeline.ts` — incremental update logic
- `packages/plugin-wiki/src/pipeline/__tests__/summarize.test.ts`
- `packages/plugin-wiki/src/pipeline/__tests__/UpdatePipeline.test.ts`

**Modify:**
- `packages/core/package.json` — add `prepack` script
- `packages/plugin-wiki/package.json` — add `prepack` script
- `packages/plugin-context/package.json` — add `prepack` script
- `packages/plugin-spec/package.json` — add `prepack` script
- `packages/cli/package.json` — add `prepack` script
- `packages/plugin-wiki/src/types.ts` — add `ManifestV2`, `AnyManifest`, `UpdateOptions`
- `packages/plugin-wiki/src/backends/ManifestManager.ts` — accept/return `AnyManifest`
- `packages/plugin-wiki/src/backends/LocalMarkdownBackend.ts` — add `delete(absolutePath)`
- `packages/plugin-wiki/src/backends/__tests__/backends.test.ts` — add `delete` tests
- `packages/plugin-wiki/src/pipeline/GeneratePipeline.ts` — use `summarize.ts`/`render.ts`, emit v2 manifest
- `packages/plugin-wiki/src/pipeline/__tests__/pipeline.test.ts` — update `version` assertion
- `packages/plugin-wiki/src/commands/wiki/update.ts` — full implementation

---

## Task 1: Add `prepack` guard to all five packages

**Files:**
- Modify: `packages/core/package.json`
- Modify: `packages/plugin-wiki/package.json`
- Modify: `packages/plugin-context/package.json`
- Modify: `packages/plugin-spec/package.json`
- Modify: `packages/cli/package.json`

- [ ] **Step 1: Add `prepack` to `packages/core/package.json`**

Open `packages/core/package.json`. It already has a `scripts` block with `build`, `typecheck`, and `test`. Add the `prepack` line to the **existing** block:

```json
"prepack": "node -e \"const p=require('./package.json');const all={...p.dependencies,...p.devDependencies,...p.peerDependencies,...p.optionalDependencies};const bad=Object.entries(all).filter(([,v])=>v&&v.startsWith('workspace:'));if(bad.length){console.error('ERR: workspace: refs not resolved: '+bad.map(([k])=>k).join(', '));process.exit(1)}\""
```

- [ ] **Step 2: Add `prepack` to `packages/plugin-wiki/package.json`**

In `packages/plugin-wiki/package.json`, add `prepack` to the existing `scripts` block (after `"test": "vitest run"`):

```json
"prepack": "node -e \"const p=require('./package.json');const all={...p.dependencies,...p.devDependencies,...p.peerDependencies,...p.optionalDependencies};const bad=Object.entries(all).filter(([,v])=>v&&v.startsWith('workspace:'));if(bad.length){console.error('ERR: workspace: refs not resolved: '+bad.map(([k])=>k).join(', '));process.exit(1)}\""
```

- [ ] **Step 3: Add `prepack` to `packages/plugin-context/package.json`**

Same `prepack` line in the `scripts` block of `packages/plugin-context/package.json`.

- [ ] **Step 4: Add `prepack` to `packages/plugin-spec/package.json`**

Same `prepack` line in the `scripts` block of `packages/plugin-spec/package.json`.

- [ ] **Step 5: Add `prepack` to `packages/cli/package.json`**

Same `prepack` line in the `scripts` block of `packages/cli/package.json`.

- [ ] **Step 6: Verify the guard works**

Run from the repo root (single chained command — shell state doesn't persist between calls):

```bash
node -e "const p=require('./packages/cli/package.json');const all={...p.dependencies,...p.devDependencies,...p.peerDependencies,...p.optionalDependencies};const bad=Object.entries(all).filter(([,v])=>v&&v.startsWith('workspace:'));if(bad.length){console.error('ERR: workspace: refs not resolved: '+bad.map(([k])=>k).join(', '));process.exit(1)}"
```

Expected output:
```
ERR: workspace: refs not resolved: @repowiki/plugin-context, @repowiki/plugin-spec, @repowiki/plugin-wiki
```

Exit code should be 1. This confirms the guard catches workspace refs correctly.

- [ ] **Step 7: Commit**

```bash
git add packages/core/package.json packages/plugin-wiki/package.json packages/plugin-context/package.json packages/plugin-spec/package.json packages/cli/package.json
git commit -m "feat: add prepack guard to block publish with workspace: refs"
```

---

## Task 2: Extend types.ts with ManifestV2, AnyManifest, UpdateOptions

**Files:**
- Modify: `packages/plugin-wiki/src/types.ts`

- [ ] **Step 1: Add new types to `types.ts`**

After the existing `Manifest` interface (line 50–55), add:

```typescript
export interface ManifestV2 {
  version: 2;
  generatedAt: string;
  provider: string;
  files: Record<string, { hash: string; wikiPath: string; summary: string }>;
}

export type AnyManifest = Manifest | ManifestV2;

export interface UpdateOptions {
  provider: string;
  model?: string;
  apiKey?: string;
  repoPath: string;
  outputPath: string;
  concurrency: number;
}
```

- [ ] **Step 2: Verify typecheck**

```bash
yarn workspace @repowiki/plugin-wiki run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/plugin-wiki/src/types.ts
git commit -m "feat: add ManifestV2, AnyManifest, UpdateOptions types"
```

---

## Task 3: Update ManifestManager to accept AnyManifest

**Files:**
- Modify: `packages/plugin-wiki/src/backends/ManifestManager.ts`

- [ ] **Step 1: Update `ManifestManager.ts`**

Replace the full file content with:

```typescript
import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { AnyManifest } from '../types.js';

export class ManifestManager {
  private readonly manifestPath: string;
  private readonly tmpPath: string;

  constructor(outputPath: string) {
    this.manifestPath = path.join(outputPath, '.manifest.json');
    this.tmpPath = path.join(outputPath, '.manifest.json.tmp');
  }

  async load(): Promise<AnyManifest | null> {
    try {
      const content = await readFile(this.manifestPath, 'utf-8');
      return JSON.parse(content) as AnyManifest;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async save(manifest: AnyManifest): Promise<void> {
    await writeFile(this.tmpPath, JSON.stringify(manifest, null, 2), 'utf-8');
    await rename(this.tmpPath, this.manifestPath);
  }

  async computeHash(filePath: string): Promise<string> {
    const content = await readFile(filePath);
    return `sha256:${createHash('sha256').update(content).digest('hex')}`;
  }
}
```

- [ ] **Step 2: Run existing backend tests to confirm no regressions**

```bash
yarn workspace @repowiki/plugin-wiki vitest run src/backends/__tests__/backends.test.ts
```

Expected: all tests pass. The existing `ManifestManager` tests use `Manifest` (v1) which is part of `AnyManifest`, so `save()` accepts it without type errors.

- [ ] **Step 3: Commit**

```bash
git add packages/plugin-wiki/src/backends/ManifestManager.ts
git commit -m "feat: update ManifestManager to accept AnyManifest (v1 + v2)"
```

---

## Task 4: Add `LocalMarkdownBackend.delete()`

**Files:**
- Modify: `packages/plugin-wiki/src/backends/LocalMarkdownBackend.ts`
- Modify: `packages/plugin-wiki/src/backends/__tests__/backends.test.ts`

- [ ] **Step 1: Write failing tests**

In `packages/plugin-wiki/src/backends/__tests__/backends.test.ts`, add to the existing `LocalMarkdownBackend` describe block (after the `query()` test):

```typescript
it('delete() removes an existing file', async () => {
  const backend = new LocalMarkdownBackend(tmpDir);
  const absPath = path.join(tmpDir, 'to-delete.md');
  await writeFile(absPath, '# delete me');
  await backend.delete(absPath);
  await expect(readFile(absPath)).rejects.toThrow();
});

it('delete() is a no-op when file does not exist', async () => {
  const backend = new LocalMarkdownBackend(tmpDir);
  const absPath = path.join(tmpDir, 'nonexistent.md');
  await expect(backend.delete(absPath)).resolves.toBeUndefined();
});

it('delete() throws on path traversal attempt', async () => {
  const backend = new LocalMarkdownBackend(tmpDir);
  const outsidePath = path.resolve(tmpDir, '../escape.md');
  await expect(backend.delete(outsidePath)).rejects.toThrow('Path traversal');
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
yarn workspace @repowiki/plugin-wiki vitest run src/backends/__tests__/backends.test.ts
```

Expected: 3 new tests fail with `backend.delete is not a function`.

- [ ] **Step 3: Implement `delete()` in `LocalMarkdownBackend.ts`**

Add `unlink` to the import at the top of the file:

```typescript
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
```

Add the `delete` method after `read()`:

```typescript
async delete(absolutePath: string): Promise<void> {
  const resolved = path.resolve(absolutePath);
  if (!resolved.startsWith(this.outputPath + path.sep) && resolved !== this.outputPath) {
    throw new Error(`Path traversal detected: ${absolutePath}`);
  }
  try {
    await unlink(resolved);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
yarn workspace @repowiki/plugin-wiki vitest run src/backends/__tests__/backends.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/plugin-wiki/src/backends/LocalMarkdownBackend.ts packages/plugin-wiki/src/backends/__tests__/backends.test.ts
git commit -m "feat: add LocalMarkdownBackend.delete() with path-traversal guard"
```

---

## Task 5: Create `pipeline/render.ts`

**Files:**
- Create: `packages/plugin-wiki/src/pipeline/render.ts`

- [ ] **Step 1: Create `render.ts`**

```typescript
import * as nodePath from 'node:path';
import type { AnalyzedNode } from '../types.js';
import { wikiFilePath } from '../types.js';

export function collectAll(node: AnalyzedNode): AnalyzedNode[] {
  return [node, ...node.children.flatMap(collectAll)];
}

export function renderMarkdown(node: AnalyzedNode, outputPath: string): string {
  const filePath = wikiFilePath(node, outputPath);
  const lines: string[] = [
    `# ${node.title}`,
    '',
    `> Path: \`${node.path}\``,
    '',
    '## Overview',
    node.summary,
  ];

  if (node.type === 'module' && node.exports.length > 0) {
    lines.push('', '## Exports');
    for (const e of node.exports) {
      lines.push(`- \`${e.kind} ${e.name}\`${e.jsDoc ? ` — ${e.jsDoc}` : ''}`);
    }
  }

  if (node.children.length > 0) {
    lines.push('', '## Children');
    for (const child of node.children) {
      const childFile = wikiFilePath(child, outputPath);
      const rel = nodePath.relative(nodePath.dirname(filePath), childFile).replace(/\\/g, '/');
      lines.push(`- [${child.title}](./${rel})`);
    }
  }

  return `${lines.join('\n')}\n`;
}
```

- [ ] **Step 2: Verify typecheck**

```bash
yarn workspace @repowiki/plugin-wiki run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/plugin-wiki/src/pipeline/render.ts
git commit -m "feat: extract renderMarkdown and collectAll into pipeline/render.ts"
```

---

## Task 6: Create `pipeline/summarize.ts`

**Files:**
- Create: `packages/plugin-wiki/src/pipeline/summarize.ts`
- Create: `packages/plugin-wiki/src/pipeline/__tests__/summarize.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/plugin-wiki/src/pipeline/__tests__/summarize.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LLMProvider } from '@repowiki/core';
import type { AnalyzedNode } from '../../types.js';
import { summarizeModule, summarizeParent } from '../summarize.js';

const mockModule: AnalyzedNode = {
  type: 'module',
  path: 'src/index',
  title: 'index',
  summary: '',
  exports: [{ kind: 'function', name: 'doSomething' }],
  children: [],
};

describe('summarizeModule', () => {
  let provider: LLMProvider;

  beforeEach(() => {
    provider = { complete: vi.fn().mockResolvedValue('module summary') };
  });

  it('calls provider.complete and returns the result', async () => {
    const result = await summarizeModule(mockModule, provider);
    expect(result).toBe('module summary');
    expect(vi.mocked(provider.complete)).toHaveBeenCalledOnce();
  });

  it('includes node path in the user message', async () => {
    await summarizeModule(mockModule, provider);
    const messages = vi.mocked(provider.complete).mock.calls[0][0];
    const userMessage = messages.find((m) => m.role === 'user')?.content ?? '';
    expect(userMessage).toContain('src/index');
  });

  it('includes export name in the user message', async () => {
    await summarizeModule(mockModule, provider);
    const messages = vi.mocked(provider.complete).mock.calls[0][0];
    const userMessage = messages.find((m) => m.role === 'user')?.content ?? '';
    expect(userMessage).toContain('doSomething');
  });

  it('retries once on 429 and returns the retry result', async () => {
    vi.useFakeTimers();
    const p: LLMProvider = {
      complete: vi.fn()
        .mockRejectedValueOnce({ status: 429 })
        .mockResolvedValueOnce('retry ok'),
    };
    const promise = summarizeModule(mockModule, p);
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;
    expect(result).toBe('retry ok');
    expect(vi.mocked(p.complete)).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('throws immediately on non-429 errors', async () => {
    const p: LLMProvider = {
      complete: vi.fn().mockRejectedValue(new Error('network error')),
    };
    await expect(summarizeModule(mockModule, p)).rejects.toThrow('network error');
    expect(vi.mocked(p.complete)).toHaveBeenCalledTimes(1);
  });

  it('throws on second 429', async () => {
    vi.useFakeTimers();
    const p: LLMProvider = {
      complete: vi.fn().mockRejectedValue({ status: 429 }),
    };
    const promise = summarizeModule(mockModule, p);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(promise).rejects.toMatchObject({ status: 429 });
    vi.useRealTimers();
  });
});

describe('summarizeParent', () => {
  it('reads child summaries from node.children and passes them to provider', async () => {
    const parent: AnalyzedNode = {
      type: 'directory',
      path: 'src',
      title: 'src',
      summary: '',
      exports: [],
      children: [{ ...mockModule, summary: 'the child summary text' }],
    };
    const provider: LLMProvider = { complete: vi.fn().mockResolvedValue('parent summary') };
    const result = await summarizeParent(parent, provider);
    expect(result).toBe('parent summary');
    const messages = vi.mocked(provider.complete).mock.calls[0][0];
    const userMessage = messages.find((m) => m.role === 'user')?.content ?? '';
    expect(userMessage).toContain('the child summary text');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
yarn workspace @repowiki/plugin-wiki vitest run src/pipeline/__tests__/summarize.test.ts
```

Expected: all tests fail with `Cannot find module '../summarize.js'`.

- [ ] **Step 3: Create `pipeline/summarize.ts`**

```typescript
import type { LLMProvider } from '@repowiki/core';
import type { AnalyzedNode } from '../types.js';

export async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    if (status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return fn();
    }
    throw err;
  }
}

export async function summarizeModule(
  node: AnalyzedNode,
  provider: LLMProvider,
): Promise<string> {
  const exportList = node.exports
    .map((e) => `- ${e.kind} ${e.name}${e.jsDoc ? ` — ${e.jsDoc}` : ''}`)
    .join('\n');
  const messages = [
    {
      role: 'system' as const,
      content:
        'You are a technical writer. Generate concise wiki entries for a software codebase. Be specific and factual. Do not hallucinate APIs that are not listed.',
    },
    {
      role: 'user' as const,
      content: `Write a 2–3 sentence summary for this TypeScript module.\n\nPath: ${node.path}\nExports:\n${exportList || '(none)'}`,
    },
  ];
  return callWithRetry(() => provider.complete(messages));
}

export async function summarizeParent(
  node: AnalyzedNode,
  provider: LLMProvider,
): Promise<string> {
  const childList = node.children
    .map((c) => `- ${c.title}: ${c.summary.split('.')[0]}.`)
    .join('\n');
  const messages = [
    {
      role: 'system' as const,
      content:
        'You are a technical writer. Generate concise wiki entries for a software codebase. Be specific and factual.',
    },
    {
      role: 'user' as const,
      content: `Write a 2–3 sentence summary for this ${node.type} node in a TypeScript project.\nIt contains the following children:\n${childList}`,
    },
  ];
  return callWithRetry(() => provider.complete(messages));
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
yarn workspace @repowiki/plugin-wiki vitest run src/pipeline/__tests__/summarize.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/plugin-wiki/src/pipeline/summarize.ts packages/plugin-wiki/src/pipeline/__tests__/summarize.test.ts
git commit -m "feat: add pipeline/summarize.ts with summarizeModule, summarizeParent, callWithRetry"
```

---

## Task 7: Refactor `GeneratePipeline` to use `summarize.ts`/`render.ts` and emit v2 manifest

**Files:**
- Modify: `packages/plugin-wiki/src/pipeline/GeneratePipeline.ts`
- Modify: `packages/plugin-wiki/src/pipeline/__tests__/pipeline.test.ts`

- [ ] **Step 1: Replace `GeneratePipeline.ts` with the refactored version**

Replace the full file with:

```typescript
import { readFile } from 'node:fs/promises';
import * as nodePath from 'node:path';
import type { LLMProvider } from '@repowiki/core';
import ignore from 'ignore';
import { TypeScriptAnalyzer } from '../analyzers/typescript/TypeScriptAnalyzer.js';
import { LocalMarkdownBackend } from '../backends/LocalMarkdownBackend.js';
import { ManifestManager } from '../backends/ManifestManager.js';
import { ClaudeCodeHarness } from '../harness/ClaudeCodeHarness.js';
import { CursorHarness } from '../harness/CursorHarness.js';
import { writeHarnessBlock } from '../harness/HarnessWriter.js';
import { collectAll, renderMarkdown } from './render.js';
import { summarizeModule, summarizeParent } from './summarize.js';
import type { AnalyzedNode, GenerateOptions, HarnessGenerator } from '../types.js';
import { collectNodes, wikiFilePath } from '../types.js';

export class GeneratePipeline {
  private readonly provider: LLMProvider;

  constructor(provider: LLMProvider) {
    this.provider = provider;
  }

  async run(opts: GenerateOptions): Promise<void> {
    const {
      repoPath,
      outputPath,
      dryRun,
      estimate,
      concurrency,
      harness,
      provider: providerKey,
    } = opts;
    const startTime = Date.now();

    // 1. Analyze
    const analyzer = new TypeScriptAnalyzer();
    const { root, fileMap } = await analyzer.analyzeWithFileMap(repoPath);

    if (root.children.length === 0) {
      process.stdout.write(`No TypeScript/JavaScript source files found in ${repoPath}\n`);
      process.exit(1);
    }

    // 2. Estimate
    if (estimate) {
      const modules = collectNodes(root, 'module');
      const { getEncoding } = await import('js-tiktoken');
      const enc = getEncoding('cl100k_base');
      let totalTokens = 0;
      for (const node of modules) {
        const exportList = node.exports
          .map((e) => `- ${e.kind} ${e.name}${e.jsDoc ? ` — ${e.jsDoc}` : ''}`)
          .join('\n');
        const prompt = `Write a 2–3 sentence summary for this TypeScript module.\n\nPath: ${node.path}\nExports:\n${exportList || '(none)'}`;
        const system =
          'You are a technical writer. Generate concise wiki entries for a software codebase. Be specific and factual. Do not hallucinate APIs that are not listed.';
        totalTokens += enc.encode(prompt).length + enc.encode(system).length;
      }
      process.stdout.write(
        `Estimated tokens: ${totalTokens}. Actual cost depends on your provider's pricing. Non-OpenAI providers may differ by ±30%.\n`,
      );
      return;
    }

    // 3. Dry run preview
    if (dryRun) {
      const allNodes = collectAll(root);
      const wikiFiles = allNodes.map((n) =>
        nodePath.relative(outputPath, wikiFilePath(n, outputPath)),
      );
      process.stdout.write('Files that would be written:\n');
      for (const f of wikiFiles) process.stdout.write(`  ${f}\n`);
      process.stdout.write('  .manifest.json\n');
      return;
    }

    // 4. Summarize modules (concurrent batches)
    const modules = collectNodes(root, 'module');
    const summaryMap = new Map<AnalyzedNode, string>();
    for (let i = 0; i < modules.length; i += concurrency) {
      const batch = modules.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map(async (node) => ({
          node,
          summary: await summarizeModule(node, this.provider),
        })),
      );
      for (const { node, summary } of results) {
        summaryMap.set(node, summary);
      }
    }
    for (const [node, summary] of summaryMap) {
      node.summary = summary;
    }

    // 5. Summarize non-leaf nodes bottom-up
    await summarizeNonLeaves(root, this.provider);

    // 6. Generate Markdown content
    const wikiEntries = collectAll(root).map((node) => ({
      relPath: nodePath.relative(outputPath, wikiFilePath(node, outputPath)),
      content: renderMarkdown(node, outputPath),
    }));

    // 7. Compute source file hashes (v2 manifest includes summary)
    const manifestFiles: Record<string, { hash: string; wikiPath: string; summary: string }> = {};
    const manifestMgr = new ManifestManager(outputPath);
    for (const [rawFile, moduleNode] of fileMap) {
      const absPath = nodePath.join(repoPath, rawFile);
      const hash = await manifestMgr.computeHash(absPath);
      const wp = nodePath
        .relative(repoPath, wikiFilePath(moduleNode, outputPath))
        .replace(/\\/g, '/');
      manifestFiles[rawFile] = { hash, wikiPath: wp, summary: moduleNode.summary };
    }

    // 8. Write files
    const backend = new LocalMarkdownBackend(outputPath);
    for (const { relPath, content } of wikiEntries) {
      await backend.write(relPath, content);
    }

    // 9. Save v2 manifest
    try {
      await manifestMgr.save({
        version: 2,
        generatedAt: new Date().toISOString(),
        provider: providerKey,
        files: manifestFiles,
      });
    } catch (err) {
      process.stderr.write(
        `Wiki files written but manifest could not be saved. Re-run wiki generate. (${String(err)})\n`,
      );
    }

    // 10. Gitignore check
    await checkGitignoreWarning(repoPath, outputPath);

    // 11. Harness
    if (harness) {
      const generator: HarnessGenerator =
        harness === 'claude-code' ? new ClaudeCodeHarness() : new CursorHarness();
      await writeHarnessBlock(generator.targetFile(repoPath), generator.generate(root));
    }

    // 12. Summary
    const nonLeafCount = collectAll(root).filter((n) => n.type !== 'module').length;
    const totalLlmCalls = modules.length + nonLeafCount;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    process.stdout.write(
      `Done: ${wikiEntries.length} wiki files, ${totalLlmCalls} LLM calls, ${elapsed}s\n`,
    );
  }
}

async function summarizeNonLeaves(node: AnalyzedNode, provider: LLMProvider): Promise<void> {
  for (const child of node.children) {
    await summarizeNonLeaves(child, provider);
  }
  if (node.type !== 'module') {
    node.summary = await summarizeParent(node, provider);
  }
}

async function checkGitignoreWarning(repoPath: string, outputPath: string): Promise<void> {
  try {
    const gitignore = await readFile(nodePath.join(repoPath, '.gitignore'), 'utf-8');
    const ig = ignore().add(gitignore);
    const relOutput = nodePath.relative(repoPath, outputPath);
    if (ig.ignores(relOutput) || ig.ignores(`${relOutput}/`)) {
      process.stderr.write(
        `[warn] \`${relOutput}\` appears to be gitignored. Add \`!${relOutput}/\` to .gitignore if you intend to commit the wiki.\n`,
      );
    }
  } catch {
    /* no .gitignore */
  }
}
```

- [ ] **Step 2: Update the `version` assertion in `pipeline.test.ts`**

In `packages/plugin-wiki/src/pipeline/__tests__/pipeline.test.ts`, find the test `'writes .manifest.json with sha256 hashes'`. Inside it, change:

```typescript
expect(manifest.version).toBe(1);
```

to:

```typescript
expect(manifest.version).toBe(2);
```

Then, immediately after the line `expect(entries.every((e) => e.hash.startsWith('sha256:'))).toBe(true);`, add:

```typescript
expect(entries.every((e) => typeof (e as { summary?: string }).summary === 'string')).toBe(true);
```

The `Manifest` import on the line starting `import type { Manifest } from '../../types.js'` (in the `ValidatePipeline` test section) should remain untouched — those tests still create v1 manifests and `Manifest` is still exported from `types.ts`.

- [ ] **Step 3: Run all pipeline tests**

```bash
yarn workspace @repowiki/plugin-wiki vitest run src/pipeline/__tests__/pipeline.test.ts
```

Expected: all tests pass (GeneratePipeline + ValidatePipeline suites).

- [ ] **Step 4: Run full test suite to confirm no regressions**

```bash
yarn workspace @repowiki/plugin-wiki vitest run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/plugin-wiki/src/pipeline/GeneratePipeline.ts packages/plugin-wiki/src/pipeline/__tests__/pipeline.test.ts
git commit -m "feat: refactor GeneratePipeline to use summarize.ts/render.ts and emit v2 manifest"
```

---

## Task 8: Create `UpdatePipeline.ts`

**Files:**
- Create: `packages/plugin-wiki/src/pipeline/UpdatePipeline.ts`
- Create: `packages/plugin-wiki/src/pipeline/__tests__/UpdatePipeline.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/plugin-wiki/src/pipeline/__tests__/UpdatePipeline.test.ts`:

```typescript
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { LLMProvider } from '@repowiki/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeneratePipeline } from '../GeneratePipeline.js';
import { UpdatePipeline } from '../UpdatePipeline.js';

async function makeTmpDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'repowiki-update-'));
}

async function createFixtureRepo(dir: string): Promise<void> {
  await mkdir(path.join(dir, 'src'), { recursive: true });
  await writeFile(
    path.join(dir, 'src/index.ts'),
    'export interface Foo { bar: string }\nexport function doSomething(): void {}\n',
  );
  await writeFile(path.join(dir, 'src/utils.ts'), 'export const VERSION = "1.0.0";\n');
}

describe('UpdatePipeline', () => {
  let tmpDir: string;
  let outputDir: string;
  let mockProvider: LLMProvider;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
    outputDir = path.join(tmpDir, '.repowiki');
    await createFixtureRepo(tmpDir);
    mockProvider = { complete: vi.fn().mockResolvedValue('mock summary') };
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('exits 1 when no manifest exists', async () => {
    await mkdir(outputDir, { recursive: true });
    const pipeline = new UpdatePipeline(mockProvider);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await pipeline.run({ provider: 'openai', repoPath: tmpDir, outputPath: outputDir, concurrency: 2 });
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stdoutSpy.mock.calls.some((a) => String(a[0]).includes('wiki generate'))).toBe(true);
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it('exits 1 when manifest is v1 (no summaries)', async () => {
    await mkdir(outputDir, { recursive: true });
    const { ManifestManager } = await import('../../backends/ManifestManager.js');
    const mgr = new ManifestManager(outputDir);
    await mgr.save({ version: 1, generatedAt: new Date().toISOString(), provider: 'openai', files: {} });

    const pipeline = new UpdatePipeline(mockProvider);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await pipeline.run({ provider: 'openai', repoPath: tmpDir, outputPath: outputDir, concurrency: 2 });
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stdoutSpy.mock.calls.some((a) => String(a[0]).includes('outdated'))).toBe(true);
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it('exits 0 and makes no LLM calls when nothing changed', async () => {
    // First, generate a v2 wiki
    const generateProvider: LLMProvider = { complete: vi.fn().mockResolvedValue('gen summary') };
    await new GeneratePipeline(generateProvider).run({
      provider: 'openai', dryRun: false, estimate: false, concurrency: 2,
      repoPath: tmpDir, outputPath: outputDir,
    });

    // Now update with no changes
    const updateProvider: LLMProvider = { complete: vi.fn() };
    const pipeline = new UpdatePipeline(updateProvider);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await pipeline.run({ provider: 'openai', repoPath: tmpDir, outputPath: outputDir, concurrency: 2 });
    expect(vi.mocked(updateProvider.complete)).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(stdoutSpy.mock.calls.some((a) => String(a[0]).includes('up to date'))).toBe(true);
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it('re-summarizes only the stale file and updates manifest', async () => {
    // Generate wiki first
    const generateProvider: LLMProvider = { complete: vi.fn().mockResolvedValue('gen summary') };
    await new GeneratePipeline(generateProvider).run({
      provider: 'openai', dryRun: false, estimate: false, concurrency: 2,
      repoPath: tmpDir, outputPath: outputDir,
    });
    const genCallCount = vi.mocked(generateProvider.complete).mock.calls.length;

    // Modify one file to make it stale
    await writeFile(path.join(tmpDir, 'src/utils.ts'), 'export const VERSION = "2.0.0";\n');

    // Run update
    const updateProvider: LLMProvider = { complete: vi.fn().mockResolvedValue('updated summary') };
    await new UpdatePipeline(updateProvider).run({
      provider: 'openai', repoPath: tmpDir, outputPath: outputDir, concurrency: 2,
    });

    // Fewer LLM calls than a full generate (only stale module + affected parents)
    expect(vi.mocked(updateProvider.complete).mock.calls.length).toBeLessThan(genCallCount);

    // Manifest updated with new hash and summary
    const manifest = JSON.parse(await readFile(path.join(outputDir, '.manifest.json'), 'utf-8'));
    expect(manifest.files['src/utils.ts'].summary).toBe('updated summary');

    // Updated wiki file contains new summary — use manifest.wikiPath to find the actual path
    // (wikiPath is relative to repoPath and includes the project name prefix, e.g. .repowiki/proj/src/utils.md)
    const utilsWikiPath = path.resolve(tmpDir, manifest.files['src/utils.ts'].wikiPath);
    const utilsWiki = await readFile(utilsWikiPath, 'utf-8');
    expect(utilsWiki).toContain('updated summary');
  });

  it('deletes wiki file and manifest entry for a deleted source file', async () => {
    // Generate wiki first
    await new GeneratePipeline({ complete: vi.fn().mockResolvedValue('gen') } as LLMProvider).run({
      provider: 'openai', dryRun: false, estimate: false, concurrency: 2,
      repoPath: tmpDir, outputPath: outputDir,
    });

    // Get the actual wiki path from manifest before deletion
    const manifestBefore = JSON.parse(await readFile(path.join(outputDir, '.manifest.json'), 'utf-8'));
    const utilsWikiPath = path.resolve(tmpDir, manifestBefore.files['src/utils.ts'].wikiPath);

    // Verify wiki file exists before deletion
    await expect(readFile(utilsWikiPath)).resolves.toBeTruthy();

    // Delete source file
    const { unlink } = await import('node:fs/promises');
    await unlink(path.join(tmpDir, 'src/utils.ts'));

    // Run update
    await new UpdatePipeline({ complete: vi.fn().mockResolvedValue('updated') } as LLMProvider).run({
      provider: 'openai', repoPath: tmpDir, outputPath: outputDir, concurrency: 2,
    });

    // Wiki file should be gone
    await expect(readFile(utilsWikiPath)).rejects.toThrow();

    // Manifest should not contain the deleted file
    const manifest = JSON.parse(await readFile(path.join(outputDir, '.manifest.json'), 'utf-8'));
    expect(Object.keys(manifest.files)).not.toContain('src/utils.ts');
  });

  it('writes wiki file for a new source file and adds manifest entry', async () => {
    // Generate wiki first
    await new GeneratePipeline({ complete: vi.fn().mockResolvedValue('gen') } as LLMProvider).run({
      provider: 'openai', dryRun: false, estimate: false, concurrency: 2,
      repoPath: tmpDir, outputPath: outputDir,
    });

    // Add a new source file
    await writeFile(path.join(tmpDir, 'src/new-module.ts'), 'export const X = 42;\n');

    // Run update
    await new UpdatePipeline({ complete: vi.fn().mockResolvedValue('new summary') } as LLMProvider).run({
      provider: 'openai', repoPath: tmpDir, outputPath: outputDir, concurrency: 2,
    });

    // Manifest should contain the new entry with summary
    const manifest = JSON.parse(await readFile(path.join(outputDir, '.manifest.json'), 'utf-8'));
    expect(manifest.files['src/new-module.ts']).toBeDefined();
    expect(manifest.files['src/new-module.ts'].summary).toBe('new summary');

    // New wiki file should exist — use manifest.wikiPath to find the actual path
    const newWikiPath = path.resolve(tmpDir, manifest.files['src/new-module.ts'].wikiPath);
    const newWiki = await readFile(newWikiPath, 'utf-8');
    expect(newWiki).toContain('new summary');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
yarn workspace @repowiki/plugin-wiki vitest run src/pipeline/__tests__/UpdatePipeline.test.ts
```

Expected: all tests fail with `Cannot find module '../UpdatePipeline.js'`.

- [ ] **Step 3: Create `UpdatePipeline.ts`**

```typescript
import * as nodePath from 'node:path';
import type { LLMProvider } from '@repowiki/core';
import { TypeScriptAnalyzer } from '../analyzers/typescript/TypeScriptAnalyzer.js';
import { LocalMarkdownBackend } from '../backends/LocalMarkdownBackend.js';
import { ManifestManager } from '../backends/ManifestManager.js';
import { collectAll, renderMarkdown } from './render.js';
import { summarizeModule, summarizeParent } from './summarize.js';
import type { AnalyzedNode, ManifestV2, UpdateOptions } from '../types.js';
import { wikiFilePath } from '../types.js';

export class UpdatePipeline {
  private readonly provider: LLMProvider;

  constructor(provider: LLMProvider) {
    this.provider = provider;
  }

  async run(opts: UpdateOptions): Promise<void> {
    const { repoPath, outputPath, concurrency, provider: providerKey } = opts;

    // Step 1: Load manifest
    const manifestMgr = new ManifestManager(outputPath);
    const manifest = await manifestMgr.load();
    if (!manifest) {
      process.stdout.write('Wiki not found. Run `repowiki wiki generate` first.\n');
      process.exit(1);
      return;
    }
    if (manifest.version === 1) {
      process.stdout.write(
        'Wiki manifest is outdated. Run `repowiki wiki generate` to upgrade.\n',
      );
      process.exit(1);
      return;
    }
    const m = manifest as ManifestV2;

    // Step 2: Analyse current repo state
    const analyzer = new TypeScriptAnalyzer();
    const { root, fileMap } = await analyzer.analyzeWithFileMap(repoPath);

    // Step 3: Diff — using fileMap.keys() as current file list
    const stale: string[] = [];
    const newFiles: string[] = [];
    const deleted: string[] = [];

    for (const [relPath] of fileMap) {
      if (!m.files[relPath]) {
        newFiles.push(relPath);
      } else {
        const hash = await manifestMgr.computeHash(nodePath.join(repoPath, relPath));
        if (hash !== m.files[relPath].hash) stale.push(relPath);
      }
    }
    for (const key of Object.keys(m.files)) {
      if (!fileMap.has(key)) deleted.push(key);
    }

    // Step 4: Early exit if nothing changed
    if (stale.length === 0 && newFiles.length === 0 && deleted.length === 0) {
      process.stdout.write('wiki is up to date\n');
      process.exit(0);
      return;
    }

    // Step 5: Populate summaries for unchanged nodes from manifest
    const changedNodes = new Set<AnalyzedNode>();
    for (const relPath of [...stale, ...newFiles]) {
      const node = fileMap.get(relPath);
      if (node) changedNodes.add(node);
    }
    for (const [relPath, node] of fileMap) {
      if (!changedNodes.has(node) && m.files[relPath]) {
        node.summary = m.files[relPath].summary;
      }
    }

    // Step 6: Re-summarize stale + new module nodes in concurrent batches
    const modulesToSummarize = [...changedNodes];
    for (let i = 0; i < modulesToSummarize.length; i += concurrency) {
      const batch = modulesToSummarize.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map(async (node) => ({
          node,
          summary: await summarizeModule(node, this.provider),
        })),
      );
      for (const { node, summary } of results) {
        node.summary = summary;
      }
    }

    // Step 7: Find parent nodes affected by deletions and add to changedNodes
    // so they get rebuilt even if they have no stale/new children
    if (deleted.length > 0) {
      const wikiPathToNode = new Map<string, AnalyzedNode>();
      for (const node of collectAll(root)) {
        wikiPathToNode.set(wikiFilePath(node, outputPath), node);
      }
      for (const relPath of deleted) {
        const deletedWikiAbs = nodePath.resolve(repoPath, m.files[relPath].wikiPath);
        const parentIndexAbs = nodePath.join(nodePath.dirname(deletedWikiAbs), '_index.md');
        const parentNode = wikiPathToNode.get(parentIndexAbs);
        if (parentNode) changedNodes.add(parentNode);
      }
    }

    // Step 8: Rebuild affected parent summaries (post-order DFS)
    const rebuiltParents = new Set<AnalyzedNode>();
    const rebuildAffected = async (node: AnalyzedNode): Promise<boolean> => {
      if (node.type === 'module') return changedNodes.has(node);
      let anyChildChanged = false;
      for (const child of node.children) {
        if (await rebuildAffected(child)) anyChildChanged = true;
      }
      if (anyChildChanged || changedNodes.has(node)) {
        node.summary = await summarizeParent(node, this.provider);
        rebuiltParents.add(node);
      }
      return anyChildChanged || changedNodes.has(node);
    };
    await rebuildAffected(root);

    // Step 9: Delete wiki files for deleted source files
    const backend = new LocalMarkdownBackend(outputPath);
    for (const relPath of deleted) {
      const absWikiPath = nodePath.resolve(repoPath, m.files[relPath].wikiPath);
      await backend.delete(absWikiPath);
      delete m.files[relPath];
    }

    // Step 10: Write updated wiki files (changed modules + rebuilt parents)
    for (const node of new Set([...changedNodes, ...rebuiltParents])) {
      const relWikiPath = nodePath.relative(outputPath, wikiFilePath(node, outputPath));
      await backend.write(relWikiPath, renderMarkdown(node, outputPath));
    }

    // Step 11: Save updated v2 manifest
    for (const relPath of [...stale, ...newFiles]) {
      const node = fileMap.get(relPath);
      if (!node) continue;
      const hash = await manifestMgr.computeHash(nodePath.join(repoPath, relPath));
      const wikiPathRel = nodePath
        .relative(repoPath, wikiFilePath(node, outputPath))
        .replace(/\\/g, '/');
      m.files[relPath] = { hash, wikiPath: wikiPathRel, summary: node.summary };
    }
    await manifestMgr.save({
      version: 2,
      generatedAt: new Date().toISOString(),
      provider: providerKey,
      files: m.files,
    });

    // Step 12: Print summary
    const skipped = fileMap.size - stale.length - newFiles.length;
    const updated = stale.length + newFiles.length + rebuiltParents.size;
    process.stdout.write(`${updated} updated, ${deleted.length} deleted, ${skipped} skipped\n`);
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
yarn workspace @repowiki/plugin-wiki vitest run src/pipeline/__tests__/UpdatePipeline.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Run full test suite**

```bash
yarn workspace @repowiki/plugin-wiki vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/plugin-wiki/src/pipeline/UpdatePipeline.ts packages/plugin-wiki/src/pipeline/__tests__/UpdatePipeline.test.ts
git commit -m "feat: implement UpdatePipeline incremental wiki update"
```

---

## Task 9: Implement `wiki:update` command

**Files:**
- Modify: `packages/plugin-wiki/src/commands/wiki/update.ts`

- [ ] **Step 1: Replace `update.ts` with the full implementation**

```typescript
import * as path from 'node:path';
import { Command, Flags } from '@oclif/core';
import dotenv from 'dotenv';
import { UpdatePipeline } from '../../pipeline/UpdatePipeline.js';
import { createProvider, providerEnvKey } from '../../providers/createProvider.js';

export default class WikiUpdate extends Command {
  static description = 'Incrementally update wiki for files changed since last generate';

  static examples = [
    '<%= config.bin %> wiki update --provider=openai',
    '<%= config.bin %> wiki update --provider=dashscope --model=qwen3-max',
    '<%= config.bin %> wiki update --provider=azure --model=my-deployment',
  ];

  static flags = {
    provider: Flags.string({
      description:
        'LLM provider: openai | anthropic | azure | ollama | dashscope | deepseek | openai-compat:URL',
      required: true,
    }),
    model: Flags.string({
      description: 'Override LLM model (default depends on provider)',
      required: false,
    }),
    'api-key': Flags.string({
      description: 'Override API key (default: read from env)',
      required: false,
    }),
    output: Flags.string({
      description: 'Wiki output directory',
      default: '.repowiki',
    }),
    concurrency: Flags.integer({
      description: 'Max concurrent LLM calls',
      default: 5,
    }),
  };

  async run(): Promise<void> {
    dotenv.config({ path: path.join(process.cwd(), '.env'), override: false });

    const { flags } = await this.parse(WikiUpdate);
    const repoPath = process.cwd();
    const rawOutput = flags.output;
    const outputPath = path.resolve(repoPath, rawOutput);

    const resolvedRoot = path.resolve(repoPath);
    if (!outputPath.startsWith(resolvedRoot + path.sep) && outputPath !== resolvedRoot) {
      this.error('--output must be inside the repo root');
    }

    const envKey = providerEnvKey(flags.provider);
    if (envKey && !flags['api-key'] && !process.env[envKey]) {
      this.error(`No API key found. Set ${envKey} or pass --api-key.`);
    }

    const provider = createProvider(flags.provider, {
      model: flags.model,
      apiKey: flags['api-key'],
    });

    const pipeline = new UpdatePipeline(provider);
    await pipeline.run({
      provider: flags.provider,
      model: flags.model,
      apiKey: flags['api-key'],
      concurrency: flags.concurrency,
      repoPath,
      outputPath,
    });
  }
}
```

- [ ] **Step 2: Run full test suite**

```bash
yarn workspace @repowiki/plugin-wiki vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Build the project**

```bash
yarn build
```

Expected: builds with no errors.

- [ ] **Step 4: Smoke test — verify `wiki:update --help` works**

```bash
node packages/cli/bin/run.js wiki:update --help
```

Expected output includes `--provider`, `--model`, `--concurrency`, `--output` flags.

- [ ] **Step 5: Smoke test — verify `wiki:update` detects no changes after a fresh generate**

Requires `DASHSCOPE_API_KEY` to be set. Run from the repo root (this makes real LLM calls and updates `.repowiki`; discard the resulting changes afterwards with `git checkout .repowiki`):

```bash
node packages/cli/bin/run.js wiki:generate --provider=dashscope --harness=claude-code
node packages/cli/bin/run.js wiki:update --provider=dashscope
```

Expected: second command prints `wiki is up to date` and exits 0.

If `DASHSCOPE_API_KEY` is not available, skip this step and rely on the unit tests to validate correctness.

- [ ] **Step 6: Commit**

```bash
git add packages/plugin-wiki/src/commands/wiki/update.ts
git commit -m "feat: implement wiki:update command with incremental update pipeline"
```

---

---

## Task 10: Create changeset for all five packages

**Files:**
- Creates: `.changeset/<random-name>.md` (generated by `yarn changeset`)

- [ ] **Step 1: Run `yarn changeset`**

```bash
yarn changeset
```

In the interactive prompt:
- Select `patch` for all five packages: `repowiki-cli`, `@repowiki/plugin-wiki`, `@repowiki/plugin-context`, `@repowiki/plugin-spec`, `@repowiki/core`
- Summary: `fix: resolve workspace: refs before publishing to npm`

- [ ] **Step 2: Commit the changeset**

```bash
git add .changeset/
git commit -m "chore: add changeset for npm publish fix (0.0.1 → 0.0.2)"
```

---

## Post-Merge Steps (manual, not part of this PR)

After the PR is merged and the changeset release PR is created and merged:

```bash
# Deprecate broken 0.0.1 versions (requires npm token)
npm deprecate repowiki-cli@0.0.1 "broken: workspace deps not resolved; upgrade to 0.0.2"
npm deprecate @repowiki/plugin-wiki@0.0.1 "broken: workspace deps not resolved; upgrade to 0.0.2"
npm deprecate @repowiki/plugin-context@0.0.1 "broken: workspace deps not resolved; upgrade to 0.0.2"
npm deprecate @repowiki/plugin-spec@0.0.1 "broken: workspace deps not resolved; upgrade to 0.0.2"
npm deprecate @repowiki/core@0.0.1 "broken: workspace deps not resolved; upgrade to 0.0.2"
```

A changeset for all five packages (patch bump 0.0.1 → 0.0.2) must be created via `yarn changeset` and the resulting Release PR merged before the deprecation commands above can reference 0.0.2.
