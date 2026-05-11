import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyzedNode } from '../../types.js';
import { ClaudeCodeHarness } from '../ClaudeCodeHarness.js';
import { CursorHarness } from '../CursorHarness.js';
import { HarnessWriter } from '../HarnessWriter.js';

const START = '<!-- repowiki:start -->';
const END = '<!-- repowiki:end -->';

describe('HarnessWriter', () => {
  let tmpDir: string;

  beforeEach(async () => { tmpDir = await mkdtemp(path.join(os.tmpdir(), 'repowiki-harness-')); });
  afterEach(async () => { await rm(tmpDir, { recursive: true, force: true }); });

  it('creates new file with tagged block when file does not exist', async () => {
    const filePath = path.join(tmpDir, 'CLAUDE.md');
    await HarnessWriter.write(filePath, 'inner content');
    const content = await readFile(filePath, 'utf-8');
    expect(content).toBe(`${START}\ninner content\n${END}`);
  });

  it('replaces existing block, preserves rest of file', async () => {
    const filePath = path.join(tmpDir, 'CLAUDE.md');
    await writeFile(filePath, `# Existing\n\n${START}\nold content\n${END}\n\n## Footer`);
    await HarnessWriter.write(filePath, 'new content');
    const content = await readFile(filePath, 'utf-8');
    expect(content).toContain('# Existing');
    expect(content).toContain('## Footer');
    expect(content).toContain('new content');
    expect(content).not.toContain('old content');
  });

  it('appends block when file exists but has no tags', async () => {
    const filePath = path.join(tmpDir, 'CLAUDE.md');
    await writeFile(filePath, '# Existing content');
    await HarnessWriter.write(filePath, 'appended block');
    const content = await readFile(filePath, 'utf-8');
    expect(content).toContain('# Existing content');
    expect(content).toContain('appended block');
    expect(content.indexOf('# Existing')).toBeLessThan(content.indexOf(START));
  });

  it('handles unclosed start tag: removes orphan, appends new block', async () => {
    const filePath = path.join(tmpDir, 'CLAUDE.md');
    await writeFile(filePath, `# Existing\n\n${START}\norphan content`);
    const warnSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    await HarnessWriter.write(filePath, 'new content');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unclosed repowiki block'));
    const content = await readFile(filePath, 'utf-8');
    expect(content).not.toContain(START + '\norphan');
    expect(content).toContain('new content');
    warnSpy.mockRestore();
  });

  it('is idempotent: running twice produces same result', async () => {
    const filePath = path.join(tmpDir, 'CLAUDE.md');
    await writeFile(filePath, '# Header');
    await HarnessWriter.write(filePath, 'block content');
    const first = await readFile(filePath, 'utf-8');
    await HarnessWriter.write(filePath, 'block content');
    const second = await readFile(filePath, 'utf-8');
    expect(first).toBe(second);
  });
});

const mockRoot: AnalyzedNode = {
  type: 'project',
  path: 'my-project',
  title: 'my-project',
  summary: 'A great project.',
  exports: [],
  children: [
    {
      type: 'module',
      path: 'src/index',
      title: 'index',
      summary: 'The main entry point. Exports core functions.',
      exports: [{ kind: 'function', name: 'main' }],
      children: [],
    },
    {
      type: 'module',
      path: 'src/utils',
      title: 'utils',
      summary: 'Utility helpers. Contains string manipulation.',
      exports: [{ kind: 'const', name: 'VERSION' }],
      children: [],
    },
  ],
};

describe('ClaudeCodeHarness', () => {
  it('targetFile returns CLAUDE.md in repoPath', () => {
    const h = new ClaudeCodeHarness();
    expect(h.targetFile('/some/repo')).toBe(path.join('/some/repo', 'CLAUDE.md'));
  });

  it('generate includes project summary and module table', () => {
    const h = new ClaudeCodeHarness();
    const content = h.generate(mockRoot);
    expect(content).toContain('A great project.');
    expect(content).toContain('src/index');
    expect(content).toContain('The main entry point.');
    expect(content).toContain('src/utils');
    expect(content).not.toContain('<!-- repowiki:start -->');
  });

  it('generate only lists module-type nodes', () => {
    const h = new ClaudeCodeHarness();
    const content = h.generate(mockRoot);
    expect(content.split('|').filter((s) => s.includes('my-project')).length).toBe(0);
  });
});

describe('CursorHarness', () => {
  it('targetFile returns .cursorrules in repoPath', () => {
    const h = new CursorHarness();
    expect(h.targetFile('/some/repo')).toBe(path.join('/some/repo', '.cursorrules'));
  });

  it('generate includes project summary and module table', () => {
    const h = new CursorHarness();
    const content = h.generate(mockRoot);
    expect(content).toContain('A great project.');
    expect(content).toContain('src/index');
    expect(content).not.toContain('<!-- repowiki:start -->');
  });
});
