import * as nodePath from 'node:path';
import type { WikiNode } from '@repowiki/core';
import type { ProgressReporter } from './progress.js';

export type NodeType = 'project' | 'package' | 'directory' | 'module';

export interface ExportEntry {
  kind: 'class' | 'interface' | 'type' | 'function' | 'const';
  name: string;
  jsDoc?: string;
}

export interface AnalyzedNode extends WikiNode {
  type: NodeType;
  exports: ExportEntry[];
  children: AnalyzedNode[];
}

export interface HarnessGenerator {
  generate(root: AnalyzedNode): string;
  targetFile(repoPath: string): string;
}

export interface ProviderOptions {
  model?: string;
  apiKey?: string;
  baseURL?: string;
  /** Azure OpenAI resource endpoint, e.g. https://{resource}.openai.azure.com */
  endpoint?: string;
  /** Azure OpenAI API version (default: 2024-02-01) */
  apiVersion?: string;
}

export interface GenerateOptions {
  provider: string;
  model?: string;
  apiKey?: string;
  harness?: 'claude-code' | 'cursor';
  dryRun: boolean;
  estimate: boolean;
  concurrency: number;
  repoPath: string;
  outputPath: string;
  quiet: boolean;       // consumed only by the command layer to build the reporter; pipeline does NOT read this
  onProgress?: ProgressReporter;
}

export interface ValidateOptions {
  repoPath: string;
  outputPath: string;
}

export interface Manifest {
  version: 1;
  generatedAt: string;
  provider: string;
  files: Record<string, { hash: string; wikiPath: string }>;
}

export interface ManifestV2 {
  version: 2;
  generatedAt: string;
  provider: string;
  files: Record<string, { hash: string; wikiPath: string; summary: string }>;
}

export type AnyManifest = Manifest | ManifestV2;

export interface UpdateOptions {
  provider: string;
  model?: string;
  apiKey?: string;
  repoPath: string;
  outputPath: string;
  concurrency: number;
}

/** Returns the absolute output .md file path for a given AnalyzedNode. */
export function wikiFilePath(node: AnalyzedNode, outputPath: string): string {
  switch (node.type) {
    case 'project':
      return nodePath.join(outputPath, '_index.md');
    case 'package':
    case 'directory':
      return nodePath.join(outputPath, node.path, '_index.md');
    case 'module':
      return nodePath.join(outputPath, `${node.path}.md`);
  }
}

/** Collects all nodes of a given type via depth-first traversal. */
export function collectNodes(root: AnalyzedNode, type: NodeType): AnalyzedNode[] {
  const result: AnalyzedNode[] = [];
  function visit(node: AnalyzedNode): void {
    if (node.type === type) result.push(node);
    for (const child of node.children) visit(child);
  }
  visit(root);
  return result;
}
