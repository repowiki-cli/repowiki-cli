import type { LLMProvider } from '@repowiki/core';
import type { AnalyzedNode } from '../types.js';

const RATE_LIMIT_DELAY_MS = 5000;

export async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    if (status === 429) {
      await new Promise<void>((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
      return fn();
    }
    throw err;
  }
}

export function buildModuleMessages(
  node: AnalyzedNode,
): Array<{ role: 'system' | 'user'; content: string }> {
  const exportList = node.exports
    .map((e) => `- ${e.kind} ${e.name}${e.jsDoc ? ` — ${e.jsDoc}` : ''}`)
    .join('\n');
  return [
    {
      role: 'system' as const,
      content:
        'You are a technical writer. Generate concise wiki entries for a software codebase. Be specific and factual. Do not hallucinate APIs that are not listed.',
    },
    {
      role: 'user' as const,
      content: `Write a 2–3 sentence summary for this TypeScript module.\n\nPath: ${node.path}\nExports:\n${exportList || '(none)'}`,
    },
  ];
}

export async function summarizeModule(node: AnalyzedNode, provider: LLMProvider): Promise<string> {
  return callWithRetry(() => provider.complete(buildModuleMessages(node)));
}

export async function summarizeParent(node: AnalyzedNode, provider: LLMProvider): Promise<string> {
  const childList = node.children
    .map((c) => `- ${c.title}: ${c.summary.split('.')[0]}.`)
    .join('\n');
  const messages = [
    {
      role: 'system' as const,
      content:
        'You are a technical writer. Generate concise wiki entries for a software codebase. Be specific and factual.',
    },
    {
      role: 'user' as const,
      content: `Write a 2–3 sentence summary for this ${node.type} node in a TypeScript project.\nIt contains the following children:\n${childList}`,
    },
  ];
  return callWithRetry(() => provider.complete(messages));
}
