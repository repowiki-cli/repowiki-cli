# Wiki Generate Progress Display — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time progress output to `wiki:generate` so users see per-phase status during the silent LLM-processing period.

**Architecture:** A new `progress.ts` module defines a `ProgressEvent` discriminated union and a `ProgressReporter` callback type. `GeneratePipeline` accepts an optional `onProgress` callback via `GenerateOptions` and emits events at every phase boundary; it never writes to stdout directly. The command layer creates the correct reporter (TTY in-place overwrite, CI one-line-per-phase, or quiet no-op) and passes it in.

**Tech Stack:** TypeScript + Vitest (existing); `process.stdout.isTTY`, `process.stdout.columns`, `\r` for in-place line updates; zero new runtime dependencies.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `packages/plugin-wiki/src/progress.ts` | **Create** | `ProgressEvent` union, `ProgressReporter` type, `createProgressReporter` factory (quiet/CI/TTY) |
| `packages/plugin-wiki/src/__tests__/progress.test.ts` | **Create** | Unit tests for all three reporter modes |
| `packages/plugin-wiki/src/types.ts` | **Modify** | Add `quiet: boolean` and `onProgress?: ProgressReporter` to `GenerateOptions` |
| `packages/plugin-wiki/src/pipeline/GeneratePipeline.ts` | **Modify** | `report()` wrapper; emit all events; refactor `summarizeNonLeaves`; remove final `process.stdout.write` |
| `packages/plugin-wiki/src/pipeline/__tests__/pipeline.test.ts` | **Modify** | Add `quiet: false` to existing `run()` calls; add new event-sequence tests |
| `packages/plugin-wiki/src/commands/wiki/generate.ts` | **Modify** | Add `--quiet` flag; create and pass `ProgressReporter` to pipeline |

---

## Task 1: Create `progress.ts` and its tests

**Files:**
- Create: `packages/plugin-wiki/src/progress.ts`
- Create: `packages/plugin-wiki/src/__tests__/progress.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/plugin-wiki/src/__tests__/progress.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProgressReporter } from '../progress.js';

describe('createProgressReporter – quiet', () => {
  it('does not write to stdout for any event', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const r = createProgressReporter({ quiet: true });
    r({ type: 'analyze:start' });
    r({ type: 'analyze:done', moduleCount: 5 });
    r({ type: 'summarize-modules:start', total: 5 });
    r({ type: 'summarize-modules:item', index: 1, total: 5, path: 'src/foo.ts' });
    r({ type: 'summarize-modules:done', elapsed: 1000 });
    r({ type: 'summarize-parents:start', total: 1 });
    r({ type: 'summarize-parents:item', index: 1, total: 1, title: 'root' });
    r({ type: 'summarize-parents:done', elapsed: 500 });
    r({ type: 'write:done', fileCount: 3, elapsed: 100 });
    r({ type: 'finished', fileCount: 3, llmCalls: 6, elapsed: 5000 });
    r({ type: 'abort', reason: 'no files' });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('createProgressReporter – CI (non-TTY)', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    spy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    spy.mockRestore();
    Object.defineProperty(process.stdout, 'isTTY', { value: undefined, configurable: true });
  });

  it('prints "Analyzing repository..." on analyze:start', () => {
    createProgressReporter({ quiet: false })({ type: 'analyze:start' });
    expect(spy).toHaveBeenCalledWith('Analyzing repository...\n');
  });

  it('ignores analyze:done', () => {
    createProgressReporter({ quiet: false })({ type: 'analyze:done', moduleCount: 5 });
    expect(spy).not.toHaveBeenCalled();
  });

  it('prints module count on summarize-modules:start', () => {
    createProgressReporter({ quiet: false })({ type: 'summarize-modules:start', total: 25 });
    expect(spy).toHaveBeenCalledWith('Summarizing 25 modules...\n');
  });

  it('ignores summarize-modules:item', () => {
    createProgressReporter({ quiet: false })({
      type: 'summarize-modules:item', index: 3, total: 25, path: 'src/foo.ts',
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('ignores summarize-modules:done', () => {
    createProgressReporter({ quiet: false })({ type: 'summarize-modules:done', elapsed: 5000 });
    expect(spy).not.toHaveBeenCalled();
  });

  it('prints parent count on summarize-parents:start', () => {
    createProgressReporter({ quiet: false })({ type: 'summarize-parents:start', total: 5 });
    expect(spy).toHaveBeenCalledWith('Summarizing 5 packages/directories...\n');
  });

  it('ignores summarize-parents:item and summarize-parents:done', () => {
    const r = createProgressReporter({ quiet: false });
    r({ type: 'summarize-parents:item', index: 1, total: 5, title: 'plugin-wiki' });
    r({ type: 'summarize-parents:done', elapsed: 2000 });
    expect(spy).not.toHaveBeenCalled();
  });

  it('prints file count on write:done', () => {
    createProgressReporter({ quiet: false })({ type: 'write:done', fileCount: 30, elapsed: 200 });
    expect(spy).toHaveBeenCalledWith('Written 30 wiki files\n');
  });

  it('prints Done summary on finished', () => {
    createProgressReporter({ quiet: false })({
      type: 'finished', fileCount: 30, llmCalls: 30, elapsed: 14100,
    });
    expect(spy).toHaveBeenCalledWith('Done: 30 wiki files, 30 LLM calls, 14.1s\n');
  });

  it('prints reason on abort', () => {
    createProgressReporter({ quiet: false })({ type: 'abort', reason: 'No files found' });
    expect(spy).toHaveBeenCalledWith('No files found\n');
  });
});

describe('createProgressReporter – TTY', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    Object.defineProperty(process.stdout, 'columns', { value: 80, configurable: true });
    spy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    spy.mockRestore();
    Object.defineProperty(process.stdout, 'isTTY', { value: undefined, configurable: true });
    Object.defineProperty(process.stdout, 'columns', { value: undefined, configurable: true });
  });

  it('writes analyze:start without newline', () => {
    createProgressReporter({ quiet: false })({ type: 'analyze:start' });
    const last = spy.mock.calls.at(-1)![0] as string;
    expect(last).toContain('Analyzing repository...');
    expect(last).not.toMatch(/\n$/);
  });

  it('writes analyze:done with newline', () => {
    const r = createProgressReporter({ quiet: false });
    r({ type: 'analyze:done', moduleCount: 25 });
    const joined = spy.mock.calls.map((c) => c[0] as string).join('');
    expect(joined).toContain('✓ Analyzed 25 modules');
    expect(spy.mock.calls.at(-1)![0] as string).toMatch(/\n$/);
  });

  it('uses \\r to clear previous line before new progress', () => {
    const r = createProgressReporter({ quiet: false });
    r({ type: 'analyze:start' });
    r({ type: 'summarize-modules:item', index: 1, total: 5, path: 'src/a.ts' });
    const joined = spy.mock.calls.map((c) => c[0] as string).join('');
    expect(joined).toMatch(/\r +\r/);
  });

  it('truncates progress line to columns - 1', () => {
    Object.defineProperty(process.stdout, 'columns', { value: 40, configurable: true });
    createProgressReporter({ quiet: false })({
      type: 'summarize-modules:item',
      index: 1, total: 5,
      path: 'src/' + 'x'.repeat(100) + '.ts',
    });
    const last = spy.mock.calls.at(-1)![0] as string;
    expect(last.length).toBeLessThanOrEqual(39);
  });

  it('falls back to 79 chars when columns is undefined', () => {
    Object.defineProperty(process.stdout, 'columns', { value: undefined, configurable: true });
    expect(() =>
      createProgressReporter({ quiet: false })({
        type: 'summarize-modules:item',
        index: 1, total: 5,
        path: 'src/' + 'x'.repeat(200) + '.ts',
      }),
    ).not.toThrow();
  });

  it('writes finished with newline', () => {
    createProgressReporter({ quiet: false })({
      type: 'finished', fileCount: 30, llmCalls: 30, elapsed: 14100,
    });
    const joined = spy.mock.calls.map((c) => c[0] as string).join('');
    expect(joined).toContain('Done: 30 wiki files, 30 LLM calls, 14.1s');
    expect(spy.mock.calls.at(-1)![0] as string).toMatch(/\n$/);
  });

  it('clears dirty line and writes reason on abort', () => {
    const r = createProgressReporter({ quiet: false });
    r({ type: 'analyze:start' });
    r({ type: 'abort', reason: 'No TypeScript files found' });
    const joined = spy.mock.calls.map((c) => c[0] as string).join('');
    expect(joined).toContain('No TypeScript files found');
    expect(spy.mock.calls.at(-1)![0] as string).toMatch(/\n$/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
yarn workspace @repowiki/plugin-wiki vitest run src/__tests__/progress.test.ts
```

Expected: all tests fail with "Cannot find module '../progress.js'"

- [ ] **Step 3: Implement `progress.ts`**

Create `packages/plugin-wiki/src/progress.ts`:

```typescript
export type ProgressEvent =
  | { type: 'analyze:start' }
  | { type: 'analyze:done'; moduleCount: number }
  | { type: 'summarize-modules:start'; total: number }
  | { type: 'summarize-modules:item'; index: number; total: number; path: string }
  | { type: 'summarize-modules:done'; elapsed: number }
  | { type: 'summarize-parents:start'; total: number }
  | { type: 'summarize-parents:item'; index: number; total: number; title: string }
  | { type: 'summarize-parents:done'; elapsed: number }
  | { type: 'write:done'; fileCount: number; elapsed: number }
  | { type: 'finished'; fileCount: number; llmCalls: number; elapsed: number }
  | { type: 'abort'; reason: string }

export type ProgressReporter = (event: ProgressEvent) => void

export function createProgressReporter(opts: { quiet: boolean }): ProgressReporter {
  if (opts.quiet) return () => {};
  return Boolean(process.stdout.isTTY) ? createTtyReporter() : createCiReporter();
}

function createCiReporter(): ProgressReporter {
  return (event) => {
    switch (event.type) {
      case 'analyze:start':
        process.stdout.write('Analyzing repository...\n');
        break;
      case 'summarize-modules:start':
        process.stdout.write(`Summarizing ${event.total} modules...\n`);
        break;
      case 'summarize-parents:start':
        process.stdout.write(`Summarizing ${event.total} packages/directories...\n`);
        break;
      case 'write:done':
        process.stdout.write(`Written ${event.fileCount} wiki files\n`);
        break;
      case 'finished':
        process.stdout.write(
          `Done: ${event.fileCount} wiki files, ${event.llmCalls} LLM calls, ${(event.elapsed / 1000).toFixed(1)}s\n`,
        );
        break;
      case 'abort':
        process.stdout.write(`${event.reason}\n`);
        break;
    }
  };
}

function createTtyReporter(): ProgressReporter {
  let currentLineLen = 0;
  let modulesTotal = 0;
  let parentsTotal = 0;

  function writeProgress(text: string): void {
    const maxLen = (process.stdout.columns ?? 80) - 1;
    const truncated = text.slice(0, maxLen);
    if (currentLineLen > 0) {
      process.stdout.write('\r' + ' '.repeat(currentLineLen) + '\r');
    }
    process.stdout.write(truncated);
    currentLineLen = truncated.length;
  }

  function writeLine(text: string): void {
    if (currentLineLen > 0) {
      process.stdout.write('\r' + ' '.repeat(currentLineLen) + '\r');
      currentLineLen = 0;
    }
    process.stdout.write(`${text}\n`);
  }

  return (event) => {
    switch (event.type) {
      case 'analyze:start':
        writeProgress('Analyzing repository...');
        break;
      case 'analyze:done':
        writeLine(`✓ Analyzed ${event.moduleCount} module${event.moduleCount !== 1 ? 's' : ''}`);
        break;
      case 'summarize-modules:start':
        modulesTotal = event.total;
        break;
      case 'summarize-modules:item':
        writeProgress(`Summarizing modules [${event.index}/${event.total}] ${event.path}`);
        break;
      case 'summarize-modules:done':
        writeLine(`✓ Summarized ${modulesTotal} modules (${(event.elapsed / 1000).toFixed(1)}s)`);
        break;
      case 'summarize-parents:start':
        parentsTotal = event.total;
        break;
      case 'summarize-parents:item':
        writeProgress(
          `Summarizing packages/directories [${event.index}/${event.total}] ${event.title}`,
        );
        break;
      case 'summarize-parents:done':
        writeLine(
          `✓ Summarized ${parentsTotal} packages/directories (${(event.elapsed / 1000).toFixed(1)}s)`,
        );
        break;
      case 'write:done':
        writeLine(`✓ Written ${event.fileCount} wiki files (${(event.elapsed / 1000).toFixed(1)}s)`);
        break;
      case 'finished':
        writeLine(
          `Done: ${event.fileCount} wiki files, ${event.llmCalls} LLM calls, ${(event.elapsed / 1000).toFixed(1)}s`,
        );
        break;
      case 'abort':
        writeLine(event.reason);
        break;
    }
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
yarn workspace @repowiki/plugin-wiki vitest run src/__tests__/progress.test.ts
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/plugin-wiki/src/progress.ts packages/plugin-wiki/src/__tests__/progress.test.ts
git commit -m "feat: add ProgressEvent types and createProgressReporter factory"
```

---

## Task 2: Update `GenerateOptions` in `types.ts`

**Files:**
- Modify: `packages/plugin-wiki/src/types.ts`

- [ ] **Step 1: Add `quiet` and `onProgress` to `GenerateOptions`**

In `packages/plugin-wiki/src/types.ts`, add the import after the last existing import line (currently line 2: `import type { WikiNode } from '@repowiki/core'`):

```typescript
import type { ProgressReporter } from './progress.js';
```

Replace the `GenerateOptions` interface with:

```typescript
export interface GenerateOptions {
  provider: string;
  model?: string;
  apiKey?: string;
  harness?: 'claude-code' | 'cursor';
  dryRun: boolean;
  estimate: boolean;
  concurrency: number;
  repoPath: string;
  outputPath: string;
  quiet: boolean;       // consumed only by the command layer to build the reporter; pipeline does NOT read this
  onProgress?: ProgressReporter;
}
```

- [ ] **Step 2: Verify typecheck reports only the expected errors**

```bash
yarn workspace @repowiki/plugin-wiki tsc --noEmit
```

Expected: errors on `pipeline/__tests__/pipeline.test.ts` (missing `quiet`) and `commands/wiki/generate.ts` (missing `quiet`) — these are fixed in Tasks 3 and 4.

- [ ] **Step 3: Commit**

```bash
git add packages/plugin-wiki/src/types.ts
git commit -m "feat: add quiet and onProgress fields to GenerateOptions"
```

---

## Task 3: Refactor `GeneratePipeline.ts` and update pipeline tests

**Files:**
- Modify: `packages/plugin-wiki/src/pipeline/GeneratePipeline.ts`
- Modify: `packages/plugin-wiki/src/pipeline/__tests__/pipeline.test.ts`
- Modify: `packages/plugin-wiki/src/pipeline/__tests__/UpdatePipeline.test.ts`

- [ ] **Step 1: Add new failing tests to pipeline test file**

Open `packages/plugin-wiki/src/pipeline/__tests__/pipeline.test.ts`.

**Fix the 5 existing `pipeline.run()` calls inside the `GeneratePipeline` describe block (lines 40–112)** — add `quiet: false` to each. The `ValidatePipeline` describe block also has `pipeline.run()` calls but those go to a different class and do not need this change. Find every occurrence inside `describe('GeneratePipeline', ...)` of:

```typescript
await pipeline.run({
  provider: 'openai',
  dryRun: false,
  estimate: false,
  concurrency: 2,
  repoPath: tmpDir,
  outputPath: outputDir,
});
```

and add `quiet: false,` before the closing brace. There are exactly 5 such calls inside the `describe('GeneratePipeline', ...)` block (in the `writes _index.md`, `writes per-module .md files`, `writes .manifest.json`, `LLM complete() is called`, and `--dry-run writes no files` tests). **Do not modify calls in the `ValidatePipeline` describe block — those target a different class.**

Also open `packages/plugin-wiki/src/pipeline/__tests__/UpdatePipeline.test.ts` and add `quiet: false,` to the 4 `new GeneratePipeline(...).run({...})` calls at lines 85, 113, 144, and 178 — these are setup helpers that call `GeneratePipeline.run()` directly and will also fail typecheck once `quiet` becomes required.

**Then add these imports and new describe block** at the top of the file (after existing imports):

```typescript
import type { ProgressEvent } from '../../progress.js';
```

Add the following `describe` block at the end of the file (after the `ValidatePipeline` describe block):

```typescript
describe('GeneratePipeline – progress events', () => {
  let tmpDir: string;
  let outputDir: string;
  const progressProvider: LLMProvider = {
    complete: vi.fn().mockResolvedValue('mock summary'),
  };

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
    outputDir = path.join(tmpDir, '.repowiki');
    await createFixtureRepo(tmpDir);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('emits analyze:start then analyze:done as first two events', async () => {
    const events: ProgressEvent[] = [];
    await new GeneratePipeline(progressProvider).run({
      provider: 'openai',
      dryRun: false,
      estimate: false,
      concurrency: 2,
      repoPath: tmpDir,
      outputPath: outputDir,
      quiet: false,
      onProgress: (e) => events.push(e),
    });
    expect(events[0].type).toBe('analyze:start');
    expect(events[1].type).toBe('analyze:done');
  });

  it('emits one summarize-modules:item per module', async () => {
    const events: ProgressEvent[] = [];
    await new GeneratePipeline(progressProvider).run({
      provider: 'openai',
      dryRun: false,
      estimate: false,
      concurrency: 2,
      repoPath: tmpDir,
      outputPath: outputDir,
      quiet: false,
      onProgress: (e) => events.push(e),
    });
    const items = events.filter((e) => e.type === 'summarize-modules:item');
    // fixture has 2 source files: src/index.ts and src/utils.ts
    expect(items).toHaveLength(2);
  });

  it('finished.llmCalls equals the number of provider.complete calls', async () => {
    const events: ProgressEvent[] = [];
    await new GeneratePipeline(progressProvider).run({
      provider: 'openai',
      dryRun: false,
      estimate: false,
      concurrency: 2,
      repoPath: tmpDir,
      outputPath: outputDir,
      quiet: false,
      onProgress: (e) => events.push(e),
    });
    const finished = events.find((e) => e.type === 'finished') as Extract<
      ProgressEvent,
      { type: 'finished' }
    >;
    expect(finished).toBeDefined();
    expect(vi.mocked(progressProvider.complete).mock.calls.length).toBe(finished.llmCalls);
  });

  it('finished is the last event', async () => {
    const events: ProgressEvent[] = [];
    await new GeneratePipeline(progressProvider).run({
      provider: 'openai',
      dryRun: false,
      estimate: false,
      concurrency: 2,
      repoPath: tmpDir,
      outputPath: outputDir,
      quiet: false,
      onProgress: (e) => events.push(e),
    });
    expect(events.at(-1)!.type).toBe('finished');
  });

  it('a throwing reporter does not abort the pipeline', async () => {
    await expect(
      new GeneratePipeline(progressProvider).run({
        provider: 'openai',
        dryRun: false,
        estimate: false,
        concurrency: 2,
        repoPath: tmpDir,
        outputPath: outputDir,
        quiet: false,
        onProgress: () => {
          throw new Error('reporter blew up');
        },
      }),
    ).resolves.not.toThrow();
  });

  it('emits abort event then re-throws on non-429 LLM error', async () => {
    const failingProvider: LLMProvider = {
      complete: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('API error'), { status: 500 })),
    };
    const events: ProgressEvent[] = [];
    await expect(
      new GeneratePipeline(failingProvider).run({
        provider: 'openai',
        dryRun: false,
        estimate: false,
        concurrency: 2,
        repoPath: tmpDir,
        outputPath: outputDir,
        quiet: false,
        onProgress: (e) => events.push(e),
      }),
    ).rejects.toThrow('API error');
    expect(events.some((e) => e.type === 'abort')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify new tests fail and existing tests fail due to missing `quiet`**

```bash
yarn workspace @repowiki/plugin-wiki vitest run src/pipeline/__tests__/pipeline.test.ts
```

Expected: compile/type errors on missing `quiet: false` in existing calls; new tests also fail.

- [ ] **Step 3: Rewrite `GeneratePipeline.ts`**

Replace the entire content of `packages/plugin-wiki/src/pipeline/GeneratePipeline.ts` with:

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
import type { ProgressEvent, ProgressReporter } from '../progress.js';
import type { AnalyzedNode, GenerateOptions, HarnessGenerator } from '../types.js';
import { collectNodes, wikiFilePath } from '../types.js';
import { collectAll, renderMarkdown } from './render.js';
import { callWithRetry, summarizeParent } from './summarize.js';

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

    const report: ProgressReporter = (event: ProgressEvent) => {
      try {
        opts.onProgress?.(event);
      } catch {
        // swallow reporter errors — a faulty reporter must never abort the pipeline
      }
    };

    // 1. Analyze
    const analyzer = new TypeScriptAnalyzer();
    report({ type: 'analyze:start' });
    const { root, fileMap } = await analyzer.analyzeWithFileMap(repoPath);

    if (root.children.length === 0) {
      report({
        type: 'abort',
        reason: `No TypeScript/JavaScript source files found in ${repoPath}`,
      });
      process.exit(1);
    }

    const modules = collectNodes(root, 'module');
    report({ type: 'analyze:done', moduleCount: modules.length });

    // 2. Estimate (early exit)
    if (estimate) {
      const { getEncoding } = await import('js-tiktoken');
      const enc = getEncoding('cl100k_base');
      let totalTokens = 0;
      for (const node of modules) {
        const prompt = buildModulePrompt(node);
        totalTokens += enc.encode(prompt.user).length + enc.encode(prompt.system).length;
      }
      process.stdout.write(
        `Estimated tokens: ${totalTokens}. Actual cost depends on your provider's pricing. Non-OpenAI providers may differ by ±30%.\n`,
      );
      return;
    }

    // 3. Dry run preview (early exit)
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

    // 4. Summarize modules (concurrent batches, with 429 retry)
    // 5. Summarize non-leaf nodes bottom-up
    // Both phases are wrapped: a non-429 LLM error emits abort then re-throws so
    // the TTY reporter can clear its dirty progress line before the process exits.
    const summaryMap = new Map<AnalyzedNode, string>();
    try {
      report({ type: 'summarize-modules:start', total: modules.length });
      const modulesT0 = Date.now();
      let completed = 0;
      for (let i = 0; i < modules.length; i += concurrency) {
        const batch = modules.slice(i, i + concurrency);
        const results = await Promise.all(
          batch.map(async (node) => {
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
            const summary = await callWithRetry(() => this.provider.complete(messages));
            completed++;
            report({
              type: 'summarize-modules:item',
              index: completed,
              total: modules.length,
              path: node.path,
            });
            return { node, summary };
          }),
        );
        for (const { node, summary } of results) {
          summaryMap.set(node, summary);
        }
      }
      for (const [node, summary] of summaryMap) {
        node.summary = summary;
      }
      report({ type: 'summarize-modules:done', elapsed: Date.now() - modulesT0 });

      await summarizeNonLeaves(root, this.provider, report);
    } catch (err) {
      report({ type: 'abort', reason: `LLM error: ${String(err)}` });
      throw err;
    }

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
    const writeT0 = Date.now();
    const backend = new LocalMarkdownBackend(outputPath);
    for (const { relPath, content } of wikiEntries) {
      await backend.write(relPath, content);
    }
    report({ type: 'write:done', fileCount: wikiEntries.length, elapsed: Date.now() - writeT0 });

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

    // 12. Done
    const nonLeafCount = collectAll(root).filter((n) => n.type !== 'module').length;
    const totalLlmCalls = modules.length + nonLeafCount;
    report({
      type: 'finished',
      fileCount: wikiEntries.length,
      llmCalls: totalLlmCalls,
      elapsed: Date.now() - startTime,
    });
  }
}

// --- helpers ---

function collectNonLeavesBottomUp(root: AnalyzedNode): AnalyzedNode[] {
  const result: AnalyzedNode[] = [];
  function visit(node: AnalyzedNode): void {
    for (const child of node.children) visit(child);
    if (node.type !== 'module') result.push(node);
  }
  visit(root);
  return result;
}

async function summarizeNonLeaves(
  root: AnalyzedNode,
  provider: LLMProvider,
  report: ProgressReporter,
): Promise<void> {
  const nodes = collectNonLeavesBottomUp(root);
  report({ type: 'summarize-parents:start', total: nodes.length });
  const t0 = Date.now();
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    report({
      type: 'summarize-parents:item',
      index: i + 1,
      total: nodes.length,
      title: node.title,
    });
    node.summary = await summarizeParent(node, provider);
  }
  report({ type: 'summarize-parents:done', elapsed: Date.now() - t0 });
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

- [ ] **Step 4: Run all pipeline tests**

```bash
yarn workspace @repowiki/plugin-wiki vitest run src/pipeline/__tests__/pipeline.test.ts
```

Expected: all tests pass (existing + new progress tests)

- [ ] **Step 5: Run full typecheck**

```bash
yarn workspace @repowiki/plugin-wiki tsc --noEmit
```

Expected: one remaining error on `commands/wiki/generate.ts` (missing `quiet`) — fixed in Task 4.

- [ ] **Step 6: Commit**

```bash
git add packages/plugin-wiki/src/pipeline/GeneratePipeline.ts packages/plugin-wiki/src/pipeline/__tests__/pipeline.test.ts
git commit -m "feat: emit progress events from GeneratePipeline; refactor summarizeNonLeaves to flat traversal"
```

---

## Task 4: Update `wiki:generate` command

**Files:**
- Modify: `packages/plugin-wiki/src/commands/wiki/generate.ts`

- [ ] **Step 1: Add `--quiet` flag and wire reporter**

Replace the content of `packages/plugin-wiki/src/commands/wiki/generate.ts` with:

```typescript
import * as path from 'node:path';
import { Command, Flags } from '@oclif/core';
import dotenv from 'dotenv';
import { createProgressReporter } from '../../progress.js';
import { GeneratePipeline } from '../../pipeline/GeneratePipeline.js';
import { createProvider, providerEnvKey } from '../../providers/createProvider.js';

export default class WikiGenerate extends Command {
  static description = 'Analyze repo and produce layered wiki';

  static examples = [
    '<%= config.bin %> wiki generate --provider=openai',
    '<%= config.bin %> wiki generate --provider=anthropic --harness=claude-code',
    '<%= config.bin %> wiki generate --provider=dashscope --harness=claude-code',
    '<%= config.bin %> wiki generate --provider=azure --model=my-deployment --harness=claude-code',
    '<%= config.bin %> wiki generate --provider=ollama --model=llama3 --dry-run',
  ];

  static flags = {
    provider: Flags.string({
      description:
        'LLM provider: openai | anthropic | azure | ollama | dashscope | deepseek | openai-compat:URL',
      required: true,
    }),
    harness: Flags.string({
      description: 'Generate harness config: claude-code | cursor',
      required: false,
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
    'dry-run': Flags.boolean({
      description: 'Preview output without writing files',
      default: false,
    }),
    estimate: Flags.boolean({
      description: 'Print estimated token count and exit',
      default: false,
    }),
    quiet: Flags.boolean({
      description: 'Suppress all progress output',
      default: false,
    }),
  };

  async run(): Promise<void> {
    dotenv.config({ path: path.join(process.cwd(), '.env'), override: false });

    const { flags } = await this.parse(WikiGenerate);
    const repoPath = process.cwd();
    const rawOutput = flags.output;
    const outputPath = path.resolve(repoPath, rawOutput);

    const resolvedRoot = path.resolve(repoPath);
    if (!outputPath.startsWith(resolvedRoot + path.sep) && outputPath !== resolvedRoot) {
      this.error('--output must be inside the repo root');
    }

    if (!flags.estimate) {
      const envKey = providerEnvKey(flags.provider);
      if (envKey && !flags['api-key'] && !process.env[envKey]) {
        this.error(`No API key found. Set ${envKey} or pass --api-key.`);
      }
    }

    if (flags.estimate && flags['dry-run']) {
      this.log('Note: --estimate takes precedence over --dry-run.');
    }

    const provider = createProvider(flags.provider, {
      model: flags.model,
      apiKey: flags['api-key'],
    });

    const onProgress = createProgressReporter({ quiet: flags.quiet });
    const pipeline = new GeneratePipeline(provider);
    await pipeline.run({
      provider: flags.provider,
      model: flags.model,
      apiKey: flags['api-key'],
      harness: flags.harness as 'claude-code' | 'cursor' | undefined,
      dryRun: flags['dry-run'],
      estimate: flags.estimate,
      concurrency: flags.concurrency,
      repoPath,
      outputPath,
      quiet: flags.quiet,
      onProgress,
    });
  }
}
```

- [ ] **Step 2: Run full typecheck**

```bash
yarn typecheck
```

Expected: no errors

- [ ] **Step 3: Run all tests**

```bash
yarn test
```

Expected: all tests pass

- [ ] **Step 4: Build**

```bash
yarn build
```

Expected: build succeeds

- [ ] **Step 5: Smoke test**

```bash
node packages/cli/bin/run.js wiki:generate --provider=dashscope --dry-run
```

Expected: on TTY prints "Analyzing repository..." then "✓ Analyzed N modules" then the file list; on CI prints "Analyzing repository...\n" then the file list. No LLM summarization progress (dry-run exits before that phase).

```bash
node packages/cli/bin/run.js wiki:generate --provider=dashscope --estimate
```

Expected: on TTY prints "Analyzing repository..." then "✓ Analyzed N modules" then the token estimate; on CI prints "Analyzing repository...\n" then the token estimate. No LLM summarization progress.

- [ ] **Step 6: Commit**

```bash
git add packages/plugin-wiki/src/commands/wiki/generate.ts
git commit -m "feat: add --quiet flag to wiki:generate; wire progress reporter"
```
