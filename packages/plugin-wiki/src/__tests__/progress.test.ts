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
