import type { ChatMessage, LLMProvider } from '@repowiki/core';
import { AzureOpenAI } from 'openai';
import type { ProviderOptions } from '../types.js';

const DEFAULT_API_VERSION = '2025-04-01-preview';

export class AzureOpenAIProvider implements LLMProvider {
  private readonly client: AzureOpenAI;
  private readonly model: string;

  constructor(opts: ProviderOptions & { model: string }) {
    const endpoint = opts.endpoint ?? process.env.AZURE_OPENAI_ENDPOINT ?? '';
    const apiVersion =
      opts.apiVersion ?? process.env.AZURE_OPENAI_API_VERSION ?? DEFAULT_API_VERSION;
    this.client = new AzureOpenAI({
      apiKey: opts.apiKey ?? process.env.AZURE_OPENAI_API_KEY ?? '',
      endpoint,
      apiVersion,
    });
    this.model = opts.model;
  }

  async complete(messages: ChatMessage[]): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: 1024,
    });
    return response.choices[0]?.message?.content ?? '';
  }
}
