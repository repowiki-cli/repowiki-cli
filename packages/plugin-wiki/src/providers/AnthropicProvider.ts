import Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage, LLMProvider } from '@repowiki/core';
import type { ProviderOptions } from '../types.js';

export class AnthropicProvider implements LLMProvider {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(opts: ProviderOptions & { model: string }) {
    this.client = new Anthropic({ apiKey: opts.apiKey });
    this.model = opts.model;
  }

  async complete(messages: ChatMessage[]): Promise<string> {
    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    const hasSystemAfterNonSystem = messages.some(
      (m, i) => m.role === 'system' && i > 0 && messages[i - 1].role !== 'system',
    );
    if (hasSystemAfterNonSystem) {
      throw new Error('AnthropicProvider: only one system block is supported');
    }

    const system = systemMessages.map((m) => m.content).join('\n\n');
    const userMessages = nonSystemMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      ...(system ? { system } : {}),
      messages: userMessages,
    });

    const block = response.content[0];
    return block?.type === 'text' ? block.text : '';
  }
}
