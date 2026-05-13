import * as nodePath from 'node:path';
import type { AnalyzedNode } from '../types.js';
import { wikiFilePath } from '../types.js';

export function collectAll(node: AnalyzedNode): AnalyzedNode[] {
  return [node, ...node.children.flatMap(collectAll)];
}

export function renderMarkdown(node: AnalyzedNode, outputPath: string): string {
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
