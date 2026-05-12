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
      complete: vi.fn().mockImplementation(() => Promise.reject({ status: 429 })),
    };
    const resultPromise = summarizeModule(mockModule, p);
    const assertion = expect(resultPromise).rejects.toMatchObject({ status: 429 });
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
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
