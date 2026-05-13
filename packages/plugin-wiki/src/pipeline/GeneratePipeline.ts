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
import type { ProgressEvent, ProgressReporter } from '../progress.js';
import type { AnalyzedNode, GenerateOptions, HarnessGenerator } from '../types.js';
import { collectNodes, wikiFilePath } from '../types.js';
import { collectAll, renderMarkdown } from './render.js';
import { buildModuleMessages, summarizeModule, summarizeParent } from './summarize.js';

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

    const report: ProgressReporter = (event: ProgressEvent) => {
      try {
        opts.onProgress?.(event);
      } catch {
        // swallow reporter errors — a faulty reporter must never abort the pipeline
      }
    };

    // 1. Analyze
    const analyzer = new TypeScriptAnalyzer();
    report({ type: 'analyze:start' });
    const { root, fileMap } = await analyzer.analyzeWithFileMap(repoPath);

    if (root.children.length === 0) {
      report({
        type: 'abort',
        reason: `No TypeScript/JavaScript source files found in ${repoPath}`,
      });
      process.exit(1);
    }

    const modules = collectNodes(root, 'module');
    report({ type: 'analyze:done', moduleCount: modules.length });

    // 2. Estimate (early exit)
    if (estimate) {
      const { getEncoding } = await import('js-tiktoken');
      const enc = getEncoding('cl100k_base');
      let totalTokens = 0;
      for (const node of modules) {
        const msgs = buildModuleMessages(node);
        totalTokens += enc.encode(msgs[1].content).length + enc.encode(msgs[0].content).length;
      }
      process.stdout.write(
        `Estimated tokens: ${totalTokens}. Actual cost depends on your provider's pricing. Non-OpenAI providers may differ by ±30%.\n`,
      );
      return;
    }

    // 3. Dry run preview (early exit)
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
    // 5. Summarize non-leaf nodes bottom-up
    // Both phases are wrapped: a non-429 LLM error emits abort then re-throws so
    // the TTY reporter can clear its dirty progress line before the process exits.
    const summaryMap = new Map<AnalyzedNode, string>();
    try {
      report({ type: 'summarize-modules:start', total: modules.length });
      const modulesT0 = Date.now();
      let completed = 0;
      for (let i = 0; i < modules.length; i += concurrency) {
        const batch = modules.slice(i, i + concurrency);
        const results = await Promise.all(
          batch.map(async (node) => {
            const summary = await summarizeModule(node, this.provider);
            completed++;
            report({
              type: 'summarize-modules:item',
              index: completed,
              total: modules.length,
              path: node.path,
            });
            return { node, summary };
          }),
        );
        for (const { node, summary } of results) {
          summaryMap.set(node, summary);
        }
      }
      for (const [node, summary] of summaryMap) {
        node.summary = summary;
      }
      report({ type: 'summarize-modules:done', elapsed: Date.now() - modulesT0 });

      await summarizeNonLeaves(root, this.provider, report);
    } catch (err) {
      report({ type: 'abort', reason: `LLM error: ${String(err)}` });
      throw err;
    }

    // 6. Generate Markdown content
    const wikiEntries = collectAll(root).map((node) => ({
      relPath: nodePath.relative(outputPath, wikiFilePath(node, outputPath)),
      content: renderMarkdown(node, outputPath),
    }));

    // 7. Compute source file hashes (v2 manifest includes summary)
    const manifestFiles: Record<string, { hash: string; wikiPath: string; summary: string }> = {};
    const manifestMgr = new ManifestManager(outputPath);
    for (const [rawFile, moduleNode] of fileMap) {
      const absPath = nodePath.join(repoPath, rawFile);
      const hash = await manifestMgr.computeHash(absPath);
      const wp = nodePath
        .relative(repoPath, wikiFilePath(moduleNode, outputPath))
        .replace(/\\/g, '/');
      manifestFiles[rawFile] = { hash, wikiPath: wp, summary: moduleNode.summary };
    }

    // 8. Write files
    const writeT0 = Date.now();
    const backend = new LocalMarkdownBackend(outputPath);
    for (const { relPath, content } of wikiEntries) {
      await backend.write(relPath, content);
    }
    report({ type: 'write:done', fileCount: wikiEntries.length, elapsed: Date.now() - writeT0 });

    // 9. Save v2 manifest
    try {
      await manifestMgr.save({
        version: 2,
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

    // 12. Done
    const nonLeafCount = collectAll(root).filter((n) => n.type !== 'module').length;
    const totalLlmCalls = modules.length + nonLeafCount;
    report({
      type: 'finished',
      fileCount: wikiEntries.length,
      llmCalls: totalLlmCalls,
      elapsed: Date.now() - startTime,
    });
  }
}

// --- helpers ---

function collectNonLeavesBottomUp(root: AnalyzedNode): AnalyzedNode[] {
  const result: AnalyzedNode[] = [];
  function visit(node: AnalyzedNode): void {
    for (const child of node.children) visit(child);
    if (node.type !== 'module') result.push(node);
  }
  visit(root);
  return result;
}

async function summarizeNonLeaves(
  root: AnalyzedNode,
  provider: LLMProvider,
  report: ProgressReporter,
): Promise<void> {
  const nodes = collectNonLeavesBottomUp(root);
  report({ type: 'summarize-parents:start', total: nodes.length });
  const t0 = Date.now();
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    report({
      type: 'summarize-parents:item',
      index: i + 1,
      total: nodes.length,
      title: node.title,
    });
    node.summary = await summarizeParent(node, provider);
  }
  report({ type: 'summarize-parents:done', elapsed: Date.now() - t0 });
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
