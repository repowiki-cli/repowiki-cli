import * as path from 'node:path';
import { TypeScriptAnalyzer } from '../analyzers/typescript/TypeScriptAnalyzer.js';
import { ManifestManager } from '../backends/ManifestManager.js';
import type { ValidateOptions } from '../types.js';

export class ValidatePipeline {
  async run(opts: ValidateOptions): Promise<void> {
    const { repoPath, outputPath } = opts;
    const mgr = new ManifestManager(outputPath);

    const manifest = await mgr.load();
    if (!manifest) {
      process.stdout.write('Wiki not found. Run `repowiki wiki generate` first.\n');
      process.exit(1);
      return;
    }

    const analyzer = new TypeScriptAnalyzer();
    const currentFiles = await analyzer.discoverFiles(repoPath);

    const stale: string[] = [];
    const newFiles: string[] = [];
    const deleted: string[] = [];

    for (const [file, entry] of Object.entries(manifest.files)) {
      const absPath = path.join(repoPath, file);
      try {
        const hash = await mgr.computeHash(absPath);
        if (hash !== entry.hash) stale.push(file);
      } catch {
        deleted.push(file);
      }
    }

    for (const file of currentFiles) {
      if (!manifest.files[file]) newFiles.push(file);
    }

    if (stale.length === 0 && newFiles.length === 0 && deleted.length === 0) {
      process.stdout.write('wiki is up to date\n');
      process.exit(0);
    }

    if (stale.length > 0) {
      process.stdout.write(`stale (${stale.length}):\n${stale.map((f) => `  ${f}`).join('\n')}\n`);
    }
    if (newFiles.length > 0) {
      process.stdout.write(
        `new (${newFiles.length}):\n${newFiles.map((f) => `  ${f}`).join('\n')}\n`,
      );
    }
    if (deleted.length > 0) {
      process.stdout.write(
        `deleted (${deleted.length}):\n${deleted.map((f) => `  ${f}`).join('\n')}\n`,
      );
    }
    process.exit(1);
  }
}
