import { describe, expect, it, vi } from 'vitest';

// --- OpenAIProvider / AzureOpenAIProvider mock ---
vi.mock('openai', () => {
  const mockCreate = vi.fn().mockResolvedValue({
    choices: [{ message: { content: 'openai response' } }],
  });
  // biome-ignore lint/complexity/useArrowFunction: regular function required for `new` calls in Vitest 4.x
  const MockClient = vi.fn().mockImplementation(function () {
    return { chat: { completions: { create: mockCreate } } };
  });
  return {
    default: MockClient,
    AzureOpenAI: MockClient,
    __mockCreate: mockCreate,
  };
});

// --- AnthropicProvider mock ---
vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'anthropic response' }],
  });
  return {
    // biome-ignore lint/complexity/useArrowFunction: regular function required for `new` calls in Vitest 4.x
    default: vi.fn().mockImplementation(function () {
      return { messages: { create: mockCreate } };
    }),
    __mockCreate: mockCreate,
  };
});

import Anthropic from '@anthropic-ai/sdk';
import OpenAI, { AzureOpenAI } from 'openai';
import { AnthropicProvider } from '../AnthropicProvider.js';
import { AzureOpenAIProvider } from '../AzureOpenAIProvider.js';
import { createProvider } from '../createProvider.js';
import { OpenAIProvider } from '../OpenAIProvider.js';

describe('OpenAIProvider', () => {
  it('calls chat.completions.create with correct params', async () => {
    const provider = new OpenAIProvider({ apiKey: 'test-key', model: 'gpt-4o-mini' });
    const result = await provider.complete([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hello' },
    ]);
    expect(result).toBe('openai response');
    const MockOpenAI = OpenAI as unknown as {
      mock: {
        results: { value: { chat: { completions: { create: ReturnType<typeof vi.fn> } } } }[];
      };
    };
    const mockInstance = MockOpenAI.mock.results[0].value;
    expect(mockInstance.chat.completions.create).toHaveBeenCalledWith({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello' },
      ],
      max_tokens: 1024,
    });
  });

  it('forwards custom baseURL to OpenAI constructor', () => {
    new OpenAIProvider({ apiKey: 'k', baseURL: 'http://localhost:11434/v1', model: 'llama3' });
    const MockOpenAI = vi.mocked(OpenAI);
    const lastCall = MockOpenAI.mock.calls[MockOpenAI.mock.calls.length - 1];
    expect((lastCall[0] as { baseURL?: string }).baseURL).toBe('http://localhost:11434/v1');
  });
});

describe('AnthropicProvider', () => {
  it('calls messages.create with correct params', async () => {
    const provider = new AnthropicProvider({
      apiKey: 'test-key',
      model: 'claude-haiku-4-5-20251001',
    });
    const result = await provider.complete([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hello' },
    ]);
    expect(result).toBe('anthropic response');
    const MockAnthropic = Anthropic as unknown as {
      mock: { results: { value: { messages: { create: ReturnType<typeof vi.fn> } } }[] };
    };
    const mockInstance = MockAnthropic.mock.results[0].value;
    expect(mockInstance.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-haiku-4-5-20251001',
        system: 'You are helpful.',
        max_tokens: 1024,
      }),
    );
  });

  it('throws when a second system message appears in non-first position', async () => {
    const provider = new AnthropicProvider({
      apiKey: 'test-key',
      model: 'claude-haiku-4-5-20251001',
    });
    await expect(
      provider.complete([
        { role: 'system', content: 'First system' },
        { role: 'user', content: 'Hello' },
        { role: 'system', content: 'Second system' },
      ]),
    ).rejects.toThrow('AnthropicProvider: only one system block is supported');
  });
});

describe('AzureOpenAIProvider', () => {
  it('calls chat.completions.create with correct params', async () => {
    const provider = new AzureOpenAIProvider({
      apiKey: 'test-key',
      endpoint: 'https://my-resource.openai.azure.com',
      model: 'gpt-4o-mini',
    });
    const result = await provider.complete([{ role: 'user', content: 'Hello' }]);
    expect(result).toBe('openai response');
  });

  it('uses AzureOpenAI constructor with endpoint and apiVersion', () => {
    new AzureOpenAIProvider({
      apiKey: 'k',
      endpoint: 'https://my-resource.openai.azure.com',
      apiVersion: '2024-05-01-preview',
      model: 'gpt-4o',
    });
    const MockAzure = vi.mocked(AzureOpenAI);
    const lastCall = MockAzure.mock.calls[MockAzure.mock.calls.length - 1];
    expect((lastCall[0] as { endpoint?: string }).endpoint).toBe(
      'https://my-resource.openai.azure.com',
    );
    expect((lastCall[0] as { apiVersion?: string }).apiVersion).toBe('2024-05-01-preview');
  });
});

describe('createProvider', () => {
  it('openai key → OpenAIProvider', () => {
    expect(createProvider('openai', { apiKey: 'k' })).toBeInstanceOf(OpenAIProvider);
  });
  it('anthropic key → AnthropicProvider', () => {
    expect(createProvider('anthropic', { apiKey: 'k' })).toBeInstanceOf(AnthropicProvider);
  });
  it('azure key → AzureOpenAIProvider', () => {
    expect(createProvider('azure', { apiKey: 'k' })).toBeInstanceOf(AzureOpenAIProvider);
  });
  it('ollama key → OpenAIProvider', () => {
    expect(createProvider('ollama', {})).toBeInstanceOf(OpenAIProvider);
  });
  it('dashscope key → OpenAIProvider', () => {
    expect(createProvider('dashscope', { apiKey: 'k' })).toBeInstanceOf(OpenAIProvider);
  });
  it('deepseek key → OpenAIProvider', () => {
    expect(createProvider('deepseek', { apiKey: 'k' })).toBeInstanceOf(OpenAIProvider);
  });
  it('openai-compat:URL key → OpenAIProvider', () => {
    expect(createProvider('openai-compat:http://my-server/v1', { apiKey: 'k' })).toBeInstanceOf(
      OpenAIProvider,
    );
  });
  it('unknown key throws', () => {
    expect(() => createProvider('unknown', {})).toThrow('Unknown provider');
  });
});
