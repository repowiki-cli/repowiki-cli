import type { LLMProvider } from '@repowiki/core';
import type { ProviderOptions } from '../types.js';
import { AnthropicProvider } from './AnthropicProvider.js';
import { AzureOpenAIProvider } from './AzureOpenAIProvider.js';
import { OpenAIProvider } from './OpenAIProvider.js';

const PROVIDER_DEFAULTS: Record<string, { model: string; baseURL?: string; envKey?: string }> = {
  openai: { model: 'gpt-4o-mini', envKey: 'OPENAI_API_KEY' },
  anthropic: { model: 'claude-haiku-4-5-20251001', envKey: 'ANTHROPIC_API_KEY' },
  azure: { model: 'gpt-4o-mini', envKey: 'AZURE_OPENAI_API_KEY' },
  ollama: { model: 'llama3', baseURL: 'http://localhost:11434/v1' },
  dashscope: {
    model: 'qwen-turbo',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    envKey: 'DASHSCOPE_API_KEY',
  },
  deepseek: {
    model: 'deepseek-chat',
    baseURL: 'https://api.deepseek.com/v1',
    envKey: 'DEEPSEEK_API_KEY',
  },
};

export function createProvider(key: string, opts: ProviderOptions): LLMProvider {
  if (key.startsWith('openai-compat:')) {
    const baseURL = key.slice('openai-compat:'.length);
    return new OpenAIProvider({
      apiKey: opts.apiKey ?? process.env.OPENAI_API_KEY ?? '',
      baseURL,
      model: opts.model ?? 'gpt-4o-mini',
    });
  }

  const defaults = PROVIDER_DEFAULTS[key];
  if (!defaults)
    throw new Error(
      `Unknown provider: "${key}". Valid keys: ${Object.keys(PROVIDER_DEFAULTS).join(', ')}, openai-compat:URL`,
    );

  const resolvedApiKey =
    opts.apiKey ?? (defaults.envKey ? process.env[defaults.envKey] : undefined) ?? '';
  const resolvedModel = opts.model ?? defaults.model;

  if (key === 'anthropic') {
    return new AnthropicProvider({ apiKey: resolvedApiKey, model: resolvedModel });
  }

  if (key === 'azure') {
    return new AzureOpenAIProvider({
      apiKey: resolvedApiKey,
      model: resolvedModel,
      endpoint: opts.endpoint,
      apiVersion: opts.apiVersion,
    });
  }

  return new OpenAIProvider({
    apiKey: resolvedApiKey,
    model: resolvedModel,
    baseURL: opts.baseURL ?? defaults.baseURL,
  });
}

/** Returns the env var name for a provider key, or null if not needed. */
export function providerEnvKey(key: string): string | null {
  if (key.startsWith('openai-compat:')) return 'OPENAI_API_KEY';
  if (key === 'ollama') return null;
  return PROVIDER_DEFAULTS[key]?.envKey ?? null;
}
