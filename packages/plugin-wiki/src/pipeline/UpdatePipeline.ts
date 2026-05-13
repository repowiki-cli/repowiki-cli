import * as nodePath from 'node:path';
import type { LLMProvider } from '@repowiki/core';
import { TypeScriptAnalyzer } from '../analyzers/typescript/TypeScriptAnalyzer.js';
import { LocalMarkdownBackend } from '../backends/LocalMarkdownBackend.js';
import { ManifestManager } from '../backends/ManifestManager.js';
import type { AnalyzedNode, ManifestV2, UpdateOptions } from '../types.js';
import { wikiFilePath } from '../types.js';
import { collectAll, renderMarkdown } from './render.js';
import { summarizeModule, summarizeParent } from './summarize.js';

export class UpdatePipeline {
  private readonly provider: LLMProvider;

  constructor(provider: LLMProvider) {
    this.provider = provider;
  }

  async run(opts: UpdateOptions): Promise<void> {
    const { repoPath, outputPath, concurrency, provider: providerKey } = opts;

    // Step 1: Load manifest
    const manifestMgr = new ManifestManager(outputPath);
    const manifest = await manifestMgr.load();
    if (!manifest) {
      process.stdout.write('Wiki not found. Run `repowiki wiki generate` first.\n');
      process.exit(1);
      return;
    }
    if (manifest.version === 1) {
      process.stdout.write('Wiki manifest is outdated. Run `repowiki wiki generate` to upgrade.\n');
      process.exit(1);
      return;
    }
    const m = manifest as ManifestV2;

    // Step 2: Analyse current repo state
    const analyzer = new TypeScriptAnalyzer();
    const { root, fileMap } = await analyzer.analyzeWithFileMap(repoPath);

    // Step 3: Diff using fileMap.keys() as current file list
    const stale: string[] = [];
    const newFiles: string[] = [];
    const deleted: string[] = [];
    const hashCache = new Map<string, string>();

    for (const [relPath] of fileMap) {
      if (!m.files[relPath]) {
        newFiles.push(relPath);
      } else {
        const hash = await manifestMgr.computeHash(nodePath.join(repoPath, relPath));
        hashCache.set(relPath, hash);
        if (hash !== m.files[relPath].hash) stale.push(relPath);
      }
    }
    for (const key of Object.keys(m.files)) {
      if (!fileMap.has(key)) deleted.push(key);
    }

    // Step 4: Early exit if nothing changed
    if (stale.length === 0 && newFiles.length === 0 && deleted.length === 0) {
      process.stdout.write('wiki is up to date\n');
      process.exit(0);
      return;
    }

    // Step 5: Build changedNodes set and populate summaries for unchanged nodes
    const changedNodes = new Set<AnalyzedNode>();
    for (const relPath of [...stale, ...newFiles]) {
      const node = fileMap.get(relPath);
      if (node) changedNodes.add(node);
    }
    for (const [relPath, node] of fileMap) {
      if (!changedNodes.has(node) && m.files[relPath]) {
        node.summary = m.files[relPath].summary;
      }
    }

    // Step 6: Re-summarize stale + new module nodes in concurrent batches
    const modulesToSummarize = [...changedNodes];
    for (let i = 0; i < modulesToSummarize.length; i += concurrency) {
      const batch = modulesToSummarize.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map(async (node) => ({
          node,
          summary: await summarizeModule(node, this.provider),
        })),
      );
      for (const { node, summary } of results) {
        node.summary = summary;
      }
    }

    // Step 7: Find parent nodes affected by deletions
    const orphanedIndexPaths = new Set<string>();
    if (deleted.length > 0) {
      const wikiPathToNode = new Map<string, AnalyzedNode>();
      for (const node of collectAll(root)) {
        wikiPathToNode.set(wikiFilePath(node, outputPath), node);
      }
      for (const relPath of deleted) {
        const deletedWikiAbs = nodePath.resolve(repoPath, m.files[relPath].wikiPath);
        const parentIndexAbs = nodePath.join(nodePath.dirname(deletedWikiAbs), '_index.md');
        const parentNode = wikiPathToNode.get(parentIndexAbs);
        if (parentNode) {
          changedNodes.add(parentNode);
        } else {
          // The parent directory no longer exists in the new tree — its _index.md is orphaned
          orphanedIndexPaths.add(parentIndexAbs);
        }
      }
    }

    // Step 8: Rebuild affected parent summaries (post-order DFS)
    const rebuiltParents = new Set<AnalyzedNode>();
    const rebuildAffected = async (node: AnalyzedNode): Promise<boolean> => {
      if (node.type === 'module') return changedNodes.has(node);
      let anyChildChanged = false;
      for (const child of node.children) {
        if (await rebuildAffected(child)) anyChildChanged = true;
      }
      if (anyChildChanged || changedNodes.has(node)) {
        node.summary = await summarizeParent(node, this.provider);
        rebuiltParents.add(node);
      }
      return anyChildChanged || changedNodes.has(node);
    };
    await rebuildAffected(root);

    // Step 9: Delete wiki files for deleted source files and prune empty directories
    const backend = new LocalMarkdownBackend(outputPath);
    for (const relPath of deleted) {
      const absWikiPath = nodePath.resolve(repoPath, m.files[relPath].wikiPath);
      await backend.delete(absWikiPath);
      await backend.pruneEmptyDirs(nodePath.dirname(absWikiPath), outputPath);
      delete m.files[relPath];
    }
    // Delete orphaned directory _index.md files (directories removed from the new tree)
    for (const orphanIndexAbs of orphanedIndexPaths) {
      await backend.delete(orphanIndexAbs);
      await backend.pruneEmptyDirs(nodePath.dirname(orphanIndexAbs), outputPath);
    }

    // Step 10: Write updated wiki files (changed modules + rebuilt parents)
    for (const node of new Set([...changedNodes, ...rebuiltParents])) {
      const relWikiPath = nodePath.relative(outputPath, wikiFilePath(node, outputPath));
      await backend.write(relWikiPath, renderMarkdown(node, outputPath));
    }

    // Step 11: Save updated v2 manifest
    for (const relPath of [...stale, ...newFiles]) {
      const node = fileMap.get(relPath);
      if (!node) continue;
      const hash =
        hashCache.get(relPath) ?? (await manifestMgr.computeHash(nodePath.join(repoPath, relPath)));
      const wikiPathRel = nodePath
        .relative(repoPath, wikiFilePath(node, outputPath))
        .replace(/\\/g, '/');
      m.files[relPath] = { hash, wikiPath: wikiPathRel, summary: node.summary };
    }
    await manifestMgr.save({
      version: 2,
      generatedAt: new Date().toISOString(),
      provider: providerKey,
      files: m.files,
    });

    // Step 12: Print summary
    const skipped = fileMap.size - stale.length - newFiles.length;
    const updated = stale.length + newFiles.length + rebuiltParents.size;
    process.stdout.write(`${updated} updated, ${deleted.length} deleted, ${skipped} skipped\n`);
  }
}
