# Harness Output Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-file module table written by `ClaudeCodeHarness` and `CursorHarness` with a compact package/directory architecture tree, eliminating context window bloat for large projects.

**Architecture:** Both harness classes gain two module-level helpers — `firstSentence()` and `buildArchitectureLines()` — that extract package/directory nodes from the tree, sort them, and render them as padded lines. The `generate()` method is rewritten to use these helpers; the `HarnessGenerator` interface and all call sites are unchanged. The helpers are duplicated in each harness file rather than extracted to a shared module — this is intentional per the spec's scope (YAGNI; the spec only modifies the two harness files).

**Tech Stack:** TypeScript (NodeNext modules), Vitest, Yarn 4 workspaces.

---

## File Structure

| File | Role |
|------|------|
| `packages/plugin-wiki/src/harness/ClaudeCodeHarness.ts` | Rewrite `generate()` — add `firstSentence` + `buildArchitectureLines` helpers |
| `packages/plugin-wiki/src/harness/CursorHarness.ts` | Same rewrite, preserving `#`/`##` heading levels and intro sentence |
| `packages/plugin-wiki/src/harness/__tests__/harness.test.ts` | Rebuild fixture; rename & rewrite two tests; add empty-Architecture test |

---

## Task 1: Rebuild test fixture and write failing tests

**Files:**
- Modify: `packages/plugin-wiki/src/harness/__tests__/harness.test.ts`

- [ ] **Step 0: Confirm the test file contains exactly three describe blocks**

```bash
grep -n "^describe(" packages/plugin-wiki/src/harness/__tests__/harness.test.ts
```

Expected output (3 lines):
```
13:describe('HarnessWriter', () => {
100:describe('ClaudeCodeHarness', () => {
123:describe('CursorHarness', () => {
```

If there are additional describe blocks not listed above, do not proceed — the plan only replaces the `ClaudeCodeHarness` and `CursorHarness` blocks and would silently discard others.

- [ ] **Step 1: Replace `mockRoot` fixture and add `flatRoot`**

Replace the entire `mockRoot` constant (lines 74–98) and add `flatRoot` directly after it:

```typescript
const mockRoot: AnalyzedNode = {
  type: 'project',
  path: 'my-project',
  title: 'My Project',
  summary: 'A great project.',
  exports: [],
  children: [
    {
      type: 'package',
      path: 'packages/core',
      title: 'core',
      summary: 'Shared TypeScript interfaces. Zero runtime dependencies.',
      exports: [],
      children: [],
    },
    {
      type: 'package',
      path: 'packages/plugin-wiki',
      title: 'plugin-wiki',
      summary: 'Wiki generation pipeline. Analyze, summarize, render.',
      exports: [],
      children: [
        {
          type: 'directory',
          path: 'packages/plugin-wiki/src',
          title: 'src',
          summary: 'Source files for the wiki plugin.',
          exports: [],
          children: [
            {
              type: 'module',
              path: 'packages/plugin-wiki/src/index',
              title: 'index',
              summary: 'Entry point. The main module.',
              exports: [{ kind: 'function', name: 'main' }],
              children: [],
            },
          ],
        },
      ],
    },
  ],
};

const flatRoot: AnalyzedNode = {
  type: 'project',
  path: 'flat-project',
  title: 'Flat Project',
  summary: 'A flat project.',
  exports: [],
  children: [
    {
      type: 'module',
      path: 'src/index',
      title: 'index',
      summary: 'Entry point.',
      exports: [],
      children: [],
    },
  ],
};
```

- [ ] **Step 2: Rewrite `ClaudeCodeHarness` describe block**

Replace the entire `describe('ClaudeCodeHarness', ...)` block (locate it by the `describe('ClaudeCodeHarness'` string — line numbers shift after Step 1):

```typescript
describe('ClaudeCodeHarness', () => {
  it('targetFile returns CLAUDE.md in repoPath', () => {
    const h = new ClaudeCodeHarness();
    expect(h.targetFile('/some/repo')).toBe(path.join('/some/repo', 'CLAUDE.md'));
  });

  it('generate includes project summary and architecture section', () => {
    const h = new ClaudeCodeHarness();
    const content = h.generate(mockRoot);
    expect(content).toContain('A great project.');
    expect(content).toContain('### Architecture');
    expect(content).toContain('`packages/core`');
    expect(content).toContain('`packages/plugin-wiki`');
    expect(content).toContain('`packages/plugin-wiki/src`');
    expect(content).toContain('Shared TypeScript interfaces.');
    expect(content).toContain('Wiki generation pipeline.');
    expect(content).toContain('Source files for the wiki plugin.');
    expect(content).toContain('> For per-file summaries, see `.repowiki/`.');
    expect(content).not.toContain('<!-- repowiki:start -->');
  });

  it('generate only lists package and directory nodes', () => {
    const h = new ClaudeCodeHarness();
    const content = h.generate(mockRoot);
    expect(content).not.toContain('packages/plugin-wiki/src/index');
    expect(content).not.toContain('my-project');
    // — separators are aligned at the same column
    const archLines = content
      .split('\n')
      .filter((l) => l.includes(' — '));
    const dashPositions = archLines.map((l) => l.indexOf(' — '));
    expect(new Set(dashPositions).size).toBe(1);
  });

  it('generate omits Architecture section when no package or directory nodes exist', () => {
    const h = new ClaudeCodeHarness();
    const content = h.generate(flatRoot);
    expect(content).toContain('A flat project.');
    expect(content).not.toContain('### Architecture');
    expect(content).not.toContain('> For per-file summaries');
  });
});
```

- [ ] **Step 3: Rewrite `CursorHarness` describe block**

Replace the entire `describe('CursorHarness', ...)` block (locate it by the `describe('CursorHarness'` string):

```typescript
describe('CursorHarness', () => {
  it('targetFile returns .cursorrules in repoPath', () => {
    const h = new CursorHarness();
    expect(h.targetFile('/some/repo')).toBe(path.join('/some/repo', '.cursorrules'));
  });

  it('generate includes project summary and architecture section', () => {
    const h = new CursorHarness();
    const content = h.generate(mockRoot);
    expect(content).toContain('A great project.');
    expect(content).toContain('## Architecture');
    expect(content).toContain('`packages/core`');
    expect(content).toContain('`packages/plugin-wiki/src`');
    expect(content).toContain('Shared TypeScript interfaces.');
    expect(content).toContain('> For per-file summaries, see `.repowiki/`.');
    expect(content).not.toContain('<!-- repowiki:start -->');
  });

  it('generate omits Architecture section when no package or directory nodes exist', () => {
    const h = new CursorHarness();
    const content = h.generate(flatRoot);
    expect(content).toContain('A flat project.');
    expect(content).not.toContain('## Architecture');
    expect(content).not.toContain('> For per-file summaries');
  });
});
```

- [ ] **Step 4: Run tests — confirm they fail**

```bash
yarn workspace @repowiki/plugin-wiki vitest run src/harness/__tests__/harness.test.ts
```

Expected: **FAIL** — `generate includes project summary and architecture section` and related tests fail because the current implementation still writes a module table.

---

## Task 2: Implement ClaudeCodeHarness

**Files:**
- Modify: `packages/plugin-wiki/src/harness/ClaudeCodeHarness.ts`

- [ ] **Step 1: Replace the entire file contents**

```typescript
import * as path from 'node:path';
import type { AnalyzedNode, HarnessGenerator } from '../types.js';
import { collectNodes } from '../types.js';

function firstSentence(summary: string): string {
  const match = summary.match(/^.*?\.(?=\s|$)/s);
  const s = (match ? match[0] : summary).trim();
  return s || '(no summary)';
}

function buildArchitectureLines(root: AnalyzedNode): string[] {
  const nodes = [
    ...collectNodes(root, 'package'),
    ...collectNodes(root, 'directory'),
  ].sort((a, b) => a.path.localeCompare(b.path));

  if (nodes.length === 0) return [];

  const backtickPaths = nodes.map((n) => `\`${n.path}\``);
  const maxLen = Math.max(...backtickPaths.map((s) => s.length));
  return nodes.map((n, i) => `${backtickPaths[i].padEnd(maxLen + 2)} — ${firstSentence(n.summary)}`);
}

export class ClaudeCodeHarness implements HarnessGenerator {
  targetFile(repoPath: string): string {
    return path.join(repoPath, 'CLAUDE.md');
  }

  generate(root: AnalyzedNode): string {
    const archLines = buildArchitectureLines(root);
    const header = `## RepoWiki — Auto-generated Context

> Generated by \`repowiki wiki generate --harness=claude-code\`. Do not edit this block manually.

### Project Overview
${root.summary}`;

    if (archLines.length === 0) return header;

    return `${header}

### Architecture
${archLines.join('\n')}

> For per-file summaries, see \`.repowiki/\`.`;
  }
}
```

- [ ] **Step 2: Run ClaudeCodeHarness tests — confirm they pass**

```bash
yarn workspace @repowiki/plugin-wiki vitest run src/harness/__tests__/harness.test.ts --reporter=verbose
```

Expected: the command exits **non-zero** (some tests fail) — this is intentional at this step. Inspect the verbose output to confirm: all 4 `ClaudeCodeHarness` tests show `✓` and all `CursorHarness` content tests show `✗` (because `CursorHarness` still generates a module table). Do not treat the non-zero exit as an error requiring diagnosis — do not commit yet; both harnesses must pass before committing the shared test file.

---

## Task 3: Implement CursorHarness

**Files:**
- Modify: `packages/plugin-wiki/src/harness/CursorHarness.ts`

- [ ] **Step 1: Replace the entire file contents**

```typescript
import * as path from 'node:path';
import type { AnalyzedNode, HarnessGenerator } from '../types.js';
import { collectNodes } from '../types.js';

function firstSentence(summary: string): string {
  const match = summary.match(/^.*?\.(?=\s|$)/s);
  const s = (match ? match[0] : summary).trim();
  return s || '(no summary)';
}

function buildArchitectureLines(root: AnalyzedNode): string[] {
  const nodes = [
    ...collectNodes(root, 'package'),
    ...collectNodes(root, 'directory'),
  ].sort((a, b) => a.path.localeCompare(b.path));

  if (nodes.length === 0) return [];

  const backtickPaths = nodes.map((n) => `\`${n.path}\``);
  const maxLen = Math.max(...backtickPaths.map((s) => s.length));
  return nodes.map((n, i) => `${backtickPaths[i].padEnd(maxLen + 2)} — ${firstSentence(n.summary)}`);
}

export class CursorHarness implements HarnessGenerator {
  targetFile(repoPath: string): string {
    return path.join(repoPath, '.cursorrules');
  }

  generate(root: AnalyzedNode): string {
    const archLines = buildArchitectureLines(root);
    const header = `# RepoWiki Context

When working in this codebase, use the following context:

## Project Overview
${root.summary}`;

    if (archLines.length === 0) return header;

    return `${header}

## Architecture
${archLines.join('\n')}

> For per-file summaries, see \`.repowiki/\`.`;
  }
}
```

- [ ] **Step 2: Run full harness test suite — confirm all pass**

```bash
yarn workspace @repowiki/plugin-wiki vitest run src/harness/__tests__/harness.test.ts --reporter=verbose
```

Expected: all 12 tests **PASS** (5 `HarnessWriter` — unchanged, already passing — + 4 `ClaudeCodeHarness` + 3 `CursorHarness`). If the actual total differs, count the `HarnessWriter` describe block in the test file to reconcile.

- [ ] **Step 3: Run full test suite — confirm no regressions**

```bash
yarn test
```

Expected: all tests **PASS**.

- [ ] **Step 4: Commit all three changed files together**

```bash
git add packages/plugin-wiki/src/harness/ClaudeCodeHarness.ts packages/plugin-wiki/src/harness/CursorHarness.ts packages/plugin-wiki/src/harness/__tests__/harness.test.ts
git commit -m "feat(plugin-wiki): replace module table with architecture tree in harness output"
```

---

## Task 4: Create changeset and final commit

**Files:**
- Create: `.changeset/<slug>.md`

- [ ] **Step 1: Create the changeset file**

First verify no file with that name exists:
```bash
ls .changeset/harness-architecture-tree.md 2>/dev/null && echo "EXISTS — delete it first" || echo "OK to create"
```

Create `.changeset/harness-architecture-tree.md`:

```markdown
---
"@repowiki/plugin-wiki": minor
---

Replace per-file module summary table in harness output (`--harness=claude-code`, `--harness=cursor`) with a compact package/directory architecture tree. For projects with hundreds or thousands of source files, the harness block now stays small (5–20 lines) instead of growing with the file count.
```

- [ ] **Step 2: Commit the changeset**

```bash
git add .changeset/harness-architecture-tree.md
git commit -m "chore: add changeset for harness output optimization"
```

- [ ] **Step 3: Run the full test suite one final time**

```bash
yarn test
```

Expected: all tests **PASS** with no failures or warnings.
