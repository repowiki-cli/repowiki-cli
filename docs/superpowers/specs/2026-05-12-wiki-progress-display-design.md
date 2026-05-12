# Wiki Generate Progress Display — Design Spec

**Date:** 2026-05-12
**Status:** Approved
**Scope:** `packages/plugin-wiki`

## Problem

`wiki:generate` is completely silent during LLM processing. For a repository with 25+ modules, the command runs for 10–60 seconds with no output, leaving users unable to distinguish a working process from a hung one.

## Goals

- Show meaningful progress during `wiki:generate` (analysis, LLM summarization, file writes)
- Support both interactive terminals (TTY) and non-interactive environments (CI, pipes)
- Zero new runtime dependencies
- Clean separation of concerns: pipeline emits events, command layer renders them
- Future `wiki:update` can reuse the same reporter mechanism

## Non-Goals

- Rich TUI (spinners, colored bars via external libraries)
- Per-file progress for `wiki:validate` (fast path, already prints stale/new/deleted lists)
- `wiki:update` implementation (stub remains; progress system must be reusable when it ships)
- Windows ConPTY / cmd.exe compatibility for `\r` overwrite (CI fallback handles those environments)
- SIGWINCH (terminal resize) handling

---

## Architecture

### Principle: Event Emission, Not Direct I/O

`GeneratePipeline` must not write to `process.stdout` for progress. Instead it calls an injected `ProgressReporter` callback. The command layer (`wiki/generate.ts`) creates the appropriate reporter and passes it via `GenerateOptions`.

```
wiki:generate command
  └─ creates ProgressReporter (TTY | CI | quiet no-op)
  └─ passes onProgress to GeneratePipeline.run(opts)
       └─ emits ProgressEvent at each phase boundary
            └─ reporter renders to stdout
```

This means:
- Pipeline is testable with a spy reporter — no stdout mocking needed
- `wiki:update` re-uses `createProgressReporter` when implemented
- TTY/CI detection is isolated in one place

---

## Interface Definitions

### New file: `packages/plugin-wiki/src/progress.ts`

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

export type ProgressReporter = (event: ProgressEvent) => void

/** Factory: returns the correct reporter based on quiet flag and TTY detection. */
export function createProgressReporter(opts: { quiet: boolean }): ProgressReporter
```

The `analyze:start` event is emitted immediately before `analyzeWithFileMap()`. Both TTY and CI reporters respond to it by writing "Analyzing repository..." (progress line for TTY, persistent line for CI). The `start` events for later phases carry `total` so the CI reporter can announce the phase size upfront. The `done` events carry `elapsed` (ms since the matching `start`) so the TTY reporter can print timing on completion.

### Changes to `GenerateOptions` (`types.ts`)

Two new fields added to `GenerateOptions`:

```typescript
export interface GenerateOptions {
  // ... existing fields ...
  quiet: boolean          // passed through from command layer; NOT read by the pipeline itself
  onProgress?: ProgressReporter
}
```

`onProgress` is optional; the pipeline defaults to a no-op when absent. Reporter errors are caught and silently swallowed inside the pipeline's `report()` wrapper — a faulty reporter must not abort the LLM pipeline.

**Note:** `quiet` is carried in `GenerateOptions` for forward compatibility (e.g., `wiki:update` reuse) but the pipeline never reads it. The command layer uses `quiet` to decide which reporter to create via `createProgressReporter({ quiet })`, and passes the resulting reporter as `onProgress`. The pipeline only cares about `onProgress`.

---

## Terminal Behavior

### Interactive TTY (`process.stdout.isTTY === true`)

Progress lines overwrite in-place using `\r`. Stage-completion lines write `\n` and persist.

```
Analyzing repository...
✓ Analyzed 25 modules
Summarizing modules [14/25] src/providers/AzureOpenAIProvider.ts
✓ Summarized 25 modules (12.1s)
Summarizing packages/directories [3/5] plugin-wiki
✓ Summarized 5 packages/directories (1.8s)
✓ Written 30 wiki files (0.2s)
Done: 30 wiki files, 30 LLM calls, 14.1s
```

Implementation:
- Track `currentLineLen` in reporter closure.
- `writeProgress(text)`: `\r + ' '.repeat(currentLineLen) + \r + text`; update `currentLineLen = text.length`. Truncate `text` to `(process.stdout.columns ?? 80) - 1` chars.
- `writeLine(text)`: if `currentLineLen > 0`, clear with `\r + spaces + \r`; then `text + \n`; reset `currentLineLen = 0`.
- `analyze:start` → `writeProgress('Analyzing repository...')`
- `analyze:done` → `writeLine('✓ Analyzed N modules')`
- `summarize-modules:item` → `writeProgress('Summarizing modules [N/T] path')`
- `summarize-modules:done` → `writeLine('✓ Summarized T modules (Xs)')`
- `summarize-parents:item` → `writeProgress('Summarizing packages/directories [N/T] title')`
- `summarize-parents:done` → `writeLine('✓ Summarized T packages/directories (Xs)')`
- `write:done` → `writeLine('✓ Written N wiki files (Xs)')`
- `finished` → `writeLine('Done: N wiki files, M LLM calls, Xs')`

### Non-TTY / CI (`process.stdout.isTTY !== true`)

One line per pipeline phase, no in-place updates. Item-level events are ignored.

```
Analyzing repository...
Summarizing 25 modules...
Summarizing 5 packages/directories...
Written 30 wiki files
Done: 30 wiki files, 30 LLM calls, 14.1s
```

Event mapping:
- `analyze:start` → `'Analyzing repository...\n'`
- `summarize-modules:start` → `'Summarizing N modules...\n'`
- `summarize-parents:start` → `'Summarizing N packages/directories...\n'`
- `write:done` → `'Written N wiki files\n'` *(printed when write completes; past tense to match TTY reporter)*
- `finished` → `'Done: N wiki files, M LLM calls, Xs\n'`

### `--quiet` mode

The reporter is a no-op: all events are discarded, nothing is written to stdout. Errors still go to `stderr`. Dry-run and estimate output (which exits before the LLM phase) bypass the reporter and write directly — they are not "progress" in the sense this spec addresses.

---

## Pipeline Refactoring

### `summarizeNonLeaves` — recursive → flat

Replace recursive implementation with flat bottom-up traversal to enable progress reporting:

```typescript
function collectNonLeavesBottomUp(root: AnalyzedNode): AnalyzedNode[] {
  // post-order DFS preserves original semantics: children summarized before parents
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
  report: (event: ProgressEvent) => void,
): Promise<void> {
  const nodes = collectNonLeavesBottomUp(root);
  report({ type: 'summarize-parents:start', total: nodes.length });
  const t0 = Date.now();
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    report({ type: 'summarize-parents:item', index: i + 1, total: nodes.length, title: node.title });
    const prompt = buildParentPrompt(node);
    node.summary = await provider.complete([
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ]);
  }
  report({ type: 'summarize-parents:done', elapsed: Date.now() - t0 });
}
```

`index` is 1-based. Semantics are preserved: post-order (children before parents).

### Module summarization — concurrent batch with progress

```typescript
const t0 = Date.now();
report({ type: 'summarize-modules:start', total: modules.length });
let completed = 0;
for (let i = 0; i < modules.length; i += concurrency) {
  const batch = modules.slice(i, i + concurrency);
  const results = await Promise.all(
    batch.map(async (node) => {
      const prompt = buildModulePrompt(node);
      const summary = await callWithRetry(() =>
        this.provider.complete([
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ])
      );
      completed++;
      report({ type: 'summarize-modules:item', index: completed, total: modules.length, path: node.path });
      return { node, summary };
    }),
  );
  for (const { node, summary } of results) summaryMap.set(node, summary);
}
report({ type: 'summarize-modules:done', elapsed: Date.now() - t0 });
```

`completed` is incremented after each individual LLM call resolves. Within a concurrent batch, the order of increments may be non-sequential (e.g., items 1, 3, 2 complete in that order). The TTY reporter must treat `index` as a running count, not a strict sequence indicator — it should display `[count/total]`, not use `index` for bar fill calculation.

### `report()` wrapper in pipeline

The pipeline wraps every reporter call to prevent a faulty `onProgress` from aborting work:

```typescript
const report: ProgressReporter = (event) => {
  try { opts.onProgress?.(event); } catch { /* swallow */ }
};
```

### Terminal cleanup on early exit and errors

When `analyzeWithFileMap()` returns zero source files, the pipeline currently calls `process.exit(1)` directly. The `analyze:start` event is emitted before analysis begins, so the TTY reporter has written "Analyzing repository..." as a progress line (`\r`-based). Before calling `process.exit`, the pipeline must emit `analyze:done` (or a synthetic flush) to clear the dirty line. Since this exit path already calls `process.stdout.write` for the "no files found" message, a simpler approach: emit `analyze:start` but write the "no files found" message through `process.stderr.write` instead. The TTY reporter's `writeLine` call on the `finished` event (which never arrives on exit) would leave the line dirty, so the pipeline should call `report({ type: 'finished', ... })` or clear the terminal explicitly before any `process.exit` call.

Concrete rule: **the pipeline must never call `process.exit` while the TTY reporter has a non-empty `currentLineLen`.** Emit a `finished` event (even with zero counts) or add an explicit `{ type: 'abort'; reason: string }` event that reporters handle by clearing the current line and writing the reason. The latter is cleaner; if added, include it in the `ProgressEvent` union.

**Recommendation:** Add `{ type: 'abort'; reason: string }` to `ProgressEvent`. The pipeline emits it before `process.exit(1)`. TTY reporter clears the current line and writes `reason + \n`. CI reporter writes `reason + \n`. Quiet reporter ignores it.

Updated `ProgressEvent` union must include:

```typescript
| { type: 'abort'; reason: string }
```

### The "Done:" line moves from pipeline to reporter

The existing `process.stdout.write('Done: ...\n')` at the end of `GeneratePipeline.run()` is removed. The pipeline instead emits the `finished` event; the reporter renders it.

---

## Command Layer Changes (`wiki/generate.ts`)

1. Add `--quiet` flag:
   ```typescript
   quiet: Flags.boolean({
     description: 'Suppress all progress output',
     default: false,
   }),
   ```

2. Create reporter and pass to pipeline:
   ```typescript
   const onProgress = createProgressReporter({ quiet: flags.quiet });
   await pipeline.run({ ..., quiet: flags.quiet, onProgress });
   ```

---

## Files Changed

| File | Change |
|---|---|
| `plugin-wiki/src/progress.ts` | **New** — `ProgressEvent`, `ProgressReporter`, `createProgressReporter` |
| `plugin-wiki/src/types.ts` | Add `quiet: boolean` and `onProgress?: ProgressReporter` to `GenerateOptions` |
| `plugin-wiki/src/pipeline/GeneratePipeline.ts` | Wrap reporter; emit events; refactor `summarizeNonLeaves`; remove final `process.stdout.write` |
| `plugin-wiki/src/commands/wiki/generate.ts` | Add `--quiet` flag; create and pass reporter |
| `plugin-wiki/src/__tests__/progress.test.ts` | **New** — unit tests for TTY and CI reporter output |
| `plugin-wiki/src/pipeline/__tests__/pipeline.test.ts` | Update to pass spy reporter; assert event sequence |

---

## Testing Strategy

### Pipeline tests (`pipeline.test.ts`)

Pass a spy `ProgressReporter` that records all emitted events. Assert:
- `analyze:start` fires before `analyze:done`
- `summarize-modules:start` fires before the first `summarize-modules:item`
- `summarize-modules:item` count equals the number of modules
- `finished` event carries correct `fileCount` and `llmCalls`
- A reporter that throws does not abort `pipeline.run()`

### Reporter unit tests (`progress.test.ts`)

Mock `process.stdout.write` and `process.stdout.isTTY`.

- **TTY mode**: verify `\r` used for item events; `\n` used for done/finished events; line truncated to `columns - 1`; `columns` undefined falls back to 79
- **CI mode**: verify only phase-level lines written; item events produce no output
- **Quiet mode**: verify nothing written to stdout
- **abort event**: TTY clears current line and writes reason; CI writes reason

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| 0 source files found | Pipeline emits `analyze:start`, then `abort` with "No TypeScript/JavaScript source files found", then calls `process.exit(1)` |
| 0 non-leaf nodes (flat single-package repo) | `summarize-parents:start` emits `total: 0`; `done` follows immediately with `elapsed`; reporters show nothing or "0 packages" |
| 0 module nodes with non-leaf nodes | Theoretically unreachable in current analyzer; behavior undefined but `summarize-modules:start` with `total: 0` must not crash |
| Concurrency > total module count | Single batch; all items complete before next `for` iteration; progress jumps from 0 to N in one tick |
| `--quiet` + `--dry-run` | Dry-run output (file list) still printed via direct `process.stdout.write`; quiet only suppresses progress events |
| `--quiet` + `--estimate` | Token estimate still printed; estimate exits before LLM phase |
| stdout redirected to file | `isTTY` is false → CI reporter; clean line-per-stage output in the file |
| Reporter callback throws | Exception caught in `report()` wrapper; pipeline continues unaffected |
| LLM call throws non-429 | Exception propagates from `callWithRetry`; pipeline should catch, emit `abort`, then re-throw |
