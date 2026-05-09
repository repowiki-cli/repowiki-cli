import { describe, expect, it } from 'vitest';
import type { Analyzer, ChatMessage, LLMProvider, OutputBackend, WikiNode } from '../index.js';

describe('core interfaces', () => {
  it('LLMProvider shape is assignable', () => {
    const provider: LLMProvider = {
      complete: async (_messages: ChatMessage[]) => 'response',
    };
    expect(typeof provider.complete).toBe('function');
  });

  it('OutputBackend shape is assignable', () => {
    const backend: OutputBackend = {
      write: async (_path: string, _content: string) => {},
      read: async (_path: string) => 'content',
      query: async (_embedding: number[]) => [],
    };
    expect(typeof backend.write).toBe('function');
    expect(typeof backend.read).toBe('function');
    expect(typeof backend.query).toBe('function');
  });

  it('Analyzer shape is assignable', () => {
    const analyzer: Analyzer = {
      analyze: async (_repoPath: string) => [],
    };
    expect(typeof analyzer.analyze).toBe('function');
  });

  it('WikiNode has required fields', () => {
    const node: WikiNode = {
      path: 'src/auth',
      title: 'Auth Module',
      summary: 'Handles authentication',
      children: [],
    };
    expect(node.path).toBe('src/auth');
    expect(Array.isArray(node.children)).toBe(true);
  });
});
