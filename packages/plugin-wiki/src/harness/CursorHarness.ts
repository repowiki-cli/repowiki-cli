import * as path from 'node:path';
import type { AnalyzedNode, HarnessGenerator } from '../types.js';
import { collectNodes } from '../types.js';

export class CursorHarness implements HarnessGenerator {
  targetFile(repoPath: string): string {
    return path.join(repoPath, '.cursorrules');
  }

  generate(root: AnalyzedNode): string {
    const modules = collectNodes(root, 'module').sort((a, b) => a.path.localeCompare(b.path));
    const rows = modules
      .map((m) => `| \`${m.path}\` | ${m.summary.split('.')[0]}.  |`)
      .join('\n');

    return `# RepoWiki Context

When working in this codebase, use the following context:

## Project Overview
${root.summary}

## Key Modules
| Path | Description |
|------|-------------|
${rows}`;
  }
}
