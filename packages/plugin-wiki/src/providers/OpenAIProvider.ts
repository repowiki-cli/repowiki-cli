import OpenAI from 'openai';
import type { ChatMessage, LLMProvider } from '@repowiki/core';
import type { ProviderOptions } from '../types.js';

export class OpenAIProvider implements LLMProvider {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(opts: ProviderOptions & { model: string }) {
    this.client = new OpenAI({
      apiKey: opts.apiKey ?? 'no-key',
      ...(opts.baseURL ? { baseURL: opts.baseURL } : {}),
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
