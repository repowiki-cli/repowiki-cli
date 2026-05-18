import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyzedNode } from '../../types.js';
import { ClaudeCodeHarness } from '../ClaudeCodeHarness.js';
import { CursorHarness } from '../CursorHarness.js';
import { writeHarnessBlock } from '../HarnessWriter.js';

const START = '<!-- repowiki:start -->';
const END = '<!-- repowiki:end -->';

describe('HarnessWriter', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'repowiki-harness-'));
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('creates new file with tagged block when file does not exist', async () => {
    const filePath = path.join(tmpDir, 'CLAUDE.md');
    await writeHarnessBlock(filePath, 'inner content');
    const content = await readFile(filePath, 'utf-8');
    expect(content).toBe(`${START}\ninner content\n${END}`);
  });

  it('replaces existing block, preserves rest of file', async () => {
    const filePath = path.join(tmpDir, 'CLAUDE.md');
    await writeFile(filePath, `# Existing\n\n${START}\nold content\n${END}\n\n## Footer`);
    await writeHarnessBlock(filePath, 'new content');
    const content = await readFile(filePath, 'utf-8');
    expect(content).toContain('# Existing');
    expect(content).toContain('## Footer');
    expect(content).toContain('new content');
    expect(content).not.toContain('old content');
  });

  it('appends block when file exists but has no tags', async () => {
    const filePath = path.join(tmpDir, 'CLAUDE.md');
    await writeFile(filePath, '# Existing content');
    await writeHarnessBlock(filePath, 'appended block');
    const content = await readFile(filePath, 'utf-8');
    expect(content).toContain('# Existing content');
    expect(content).toContain('appended block');
    expect(content.indexOf('# Existing')).toBeLessThan(content.indexOf(START));
  });

  it('handles unclosed start tag: removes orphan, appends new block', async () => {
    const filePath = path.join(tmpDir, 'CLAUDE.md');
    await writeFile(filePath, `# Existing\n\n${START}\norphan content`);
    const warnSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    await writeHarnessBlock(filePath, 'new content');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unclosed repowiki block'));
    const content = await readFile(filePath, 'utf-8');
    expect(content).not.toContain(`${START}\norphan`);
    expect(content).toContain('new content');
    warnSpy.mockRestore();
  });

  it('is idempotent: running twice produces same result', async () => {
    const filePath = path.join(tmpDir, 'CLAUDE.md');
    await writeFile(filePath, '# Header');
    await writeHarnessBlock(filePath, 'block content');
    const first = await readFile(filePath, 'utf-8');
    await writeHarnessBlock(filePath, 'block content');
    const second = await readFile(filePath, 'utf-8');
    expect(first).toBe(second);
  });
});

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
      .filter((l) => l.startsWith('`'));
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
