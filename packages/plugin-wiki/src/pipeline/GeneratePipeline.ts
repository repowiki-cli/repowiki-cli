import { readFile } from 'node:fs/promises';
import * as nodePath from 'node:path';
import type { LLMProvider } from '@repowiki/core';
import ignore from 'ignore';
import { TypeScriptAnalyzer } from '../analyzers/typescript/TypeScriptAnalyzer.js';
import { LocalMarkdownBackend } from '../backends/LocalMarkdownBackend.js';
import { ManifestManager } from '../backends/ManifestManager.js';
import { ClaudeCodeHarness } from '../harness/ClaudeCodeHarness.js';
import { CursorHarness } from '../harness/CursorHarness.js';
import { writeHarnessBlock } from '../harness/HarnessWriter.js';
import type { AnalyzedNode, GenerateOptions } from '../types.js';
import { collectNodes, wikiFilePath } from '../types.js';
import type { HarnessGenerator } from '../types.js';

export class GeneratePipeline {
  private readonly provider: LLMProvider;

  constructor(provider: LLMProvider) {
    this.provider = provider;
  }

  async run(opts: GenerateOptions): Promise<void> {
    const {
      repoPath,
      outputPath,
      dryRun,
      estimate,
      concurrency,
      harness,
      provider: providerKey,
    } = opts;
    const startTime = Date.now();

    // 1. Analyze
    const analyzer = new TypeScriptAnalyzer();
    const { root, fileMap } = await analyzer.analyzeWithFileMap(repoPath);

    if (root.children.length === 0) {
      process.stdout.write(`No TypeScript/JavaScript source files found in ${repoPath}\n`);
      process.exit(1);
    }

    // 2. Estimate
    if (estimate) {
      const modules = collectNodes(root, 'module');
      const { getEncoding } = await import('js-tiktoken');
      const enc = getEncoding('cl100k_base');
      let totalTokens = 0;
      for (const node of modules) {
        const prompt = buildModulePrompt(node);
        totalTokens += enc.encode(prompt.user).length + enc.encode(prompt.system).length;
      }
      process.stdout.write(
        `Estimated tokens: ${totalTokens}. Actual cost depends on your provider's pricing. Non-OpenAI providers may differ by ±30%.\n`,
      );
      return;
    }

    // 3. Dry run preview (before any LLM calls)
    if (dryRun) {
      const allNodes = collectAll(root);
      const wikiFiles = allNodes.map((n) =>
        nodePath.relative(outputPath, wikiFilePath(n, outputPath)),
      );
      process.stdout.write('Files that would be written:\n');
      for (const f of wikiFiles) process.stdout.write(`  ${f}\n`);
      process.stdout.write('  .manifest.json\n');
      return;
    }

    // 4. Summarize modules (concurrent batches, with 429 retry)
    const modules = collectNodes(root, 'module');
    const summaryMap = new Map<AnalyzedNode, string>();
    for (let i = 0; i < modules.length; i += concurrency) {
      const batch = modules.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map(async (node) => {
          const prompt = buildModulePrompt(node);
          const messages: import('@repowiki/core').ChatMessage[] = [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ];
          const summary = await callWithRetry(() => this.provider.complete(messages));
          return { node, summary };
        }),
      );
      for (const { node, summary } of results) {
        summaryMap.set(node, summary);
      }
    }
    // Apply leaf summaries sequentially
    for (const [node, summary] of summaryMap) {
      node.summary = summary;
    }

    // 5. Summarize non-leaf nodes bottom-up
    await summarizeNonLeaves(root, this.provider);

    // 6. Generate Markdown content
    const wikiEntries = collectAll(root).map((node) => ({
      relPath: nodePath.relative(outputPath, wikiFilePath(node, outputPath)),
      content: renderMarkdown(node, outputPath),
    }));

    // 7. Compute source file hashes using fileMap
    const manifestFiles: Record<string, { hash: string; wikiPath: string }> = {};
    const manifestMgr = new ManifestManager(outputPath);
    for (const [rawFile, moduleNode] of fileMap) {
      const absPath = nodePath.join(repoPath, rawFile);
      const hash = await manifestMgr.computeHash(absPath);
      const wp = nodePath
        .relative(repoPath, wikiFilePath(moduleNode, outputPath))
        .replace(/\\/g, '/');
      manifestFiles[rawFile] = { hash, wikiPath: wp };
    }

    // 8. Write files
    const backend = new LocalMarkdownBackend(outputPath);
    for (const { relPath, content } of wikiEntries) {
      await backend.write(relPath, content);
    }

    // 9. Save manifest
    try {
      await manifestMgr.save({
        version: 1,
        generatedAt: new Date().toISOString(),
        provider: providerKey,
        files: manifestFiles,
      });
    } catch (err) {
      process.stderr.write(
        `Wiki files written but manifest could not be saved. Re-run wiki generate. (${String(err)})\n`,
      );
    }

    // 10. Gitignore check
    await checkGitignoreWarning(repoPath, outputPath);

    // 11. Harness
    if (harness) {
      const generator: HarnessGenerator =
        harness === 'claude-code' ? new ClaudeCodeHarness() : new CursorHarness();
      await writeHarnessBlock(generator.targetFile(repoPath), generator.generate(root));
    }

    // 12. Summary
    const nonLeafCount = collectAll(root).filter((n) => n.type !== 'module').length;
    const totalLlmCalls = modules.length + nonLeafCount;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    process.stdout.write(
      `Done: ${wikiEntries.length} wiki files, ${totalLlmCalls} LLM calls, ${elapsed}s\n`,
    );
  }
}

// --- helpers ---

interface Prompt {
  system: string;
  user: string;
}

function buildModulePrompt(node: AnalyzedNode): Prompt {
  const exportList = node.exports
    .map((e) => `- ${e.kind} ${e.name}${e.jsDoc ? ` — ${e.jsDoc}` : ''}`)
    .join('\n');
  return {
    system:
      'You are a technical writer. Generate concise wiki entries for a software codebase. Be specific and factual. Do not hallucinate APIs that are not listed.',
    user: `Write a 2–3 sentence summary for this TypeScript module.\n\nPath: ${node.path}\nExports:\n${exportList || '(none)'}`,
  };
}

function buildParentPrompt(node: AnalyzedNode): Prompt {
  const childList = node.children
    .map((c) => `- ${c.title}: ${c.summary.split('.')[0]}.`)
    .join('\n');
  return {
    system:
      'You are a technical writer. Generate concise wiki entries for a software codebase. Be specific and factual.',
    user: `Write a 2–3 sentence summary for this ${node.type} node in a TypeScript project.\nIt contains the following children:\n${childList}`,
  };
}

async function summarizeNonLeaves(node: AnalyzedNode, provider: LLMProvider): Promise<void> {
  for (const child of node.children) {
    await summarizeNonLeaves(child, provider);
  }
  if (node.type !== 'module') {
    const prompt = buildParentPrompt(node);
    node.summary = await provider.complete([
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ]);
  }
}

function collectAll(node: AnalyzedNode): AnalyzedNode[] {
  return [node, ...node.children.flatMap(collectAll)];
}

function renderMarkdown(node: AnalyzedNode, outputPath: string): string {
  const filePath = wikiFilePath(node, outputPath);
  const lines: string[] = [
    `# ${node.title}`,
    '',
    `> Path: \`${node.path}\``,
    '',
    '## Overview',
    node.summary,
  ];

  if (node.type === 'module' && node.exports.length > 0) {
    lines.push('', '## Exports');
    for (const e of node.exports) {
      lines.push(`- \`${e.kind} ${e.name}\`${e.jsDoc ? ` — ${e.jsDoc}` : ''}`);
    }
  }

  if (node.children.length > 0) {
    lines.push('', '## Children');
    for (const child of node.children) {
      const childFile = wikiFilePath(child, outputPath);
      const rel = nodePath.relative(nodePath.dirname(filePath), childFile).replace(/\\/g, '/');
      lines.push(`- [${child.title}](./${rel})`);
    }
  }

  return `${lines.join('\n')}\n`;
}

async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    if (status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return fn();
    }
    throw err;
  }
}

async function checkGitignoreWarning(repoPath: string, outputPath: string): Promise<void> {
  try {
    const gitignore = await readFile(nodePath.join(repoPath, '.gitignore'), 'utf-8');
    const ig = ignore().add(gitignore);
    const relOutput = nodePath.relative(repoPath, outputPath);
    if (ig.ignores(relOutput) || ig.ignores(`${relOutput}/`)) {
      process.stderr.write(
        `[warn] \`${relOutput}\` appears to be gitignored. Add \`!${relOutput}/\` to .gitignore if you intend to commit the wiki.\n`,
      );
    }
  } catch {
    /* no .gitignore */
  }
}
