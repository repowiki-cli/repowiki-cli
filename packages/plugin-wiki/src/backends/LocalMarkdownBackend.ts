import { mkdir, readFile, readdir, rmdir, unlink, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { OutputBackend, WikiNode } from '@repowiki/core';

export class LocalMarkdownBackend implements OutputBackend {
  private readonly outputPath: string;

  constructor(outputPath: string) {
    this.outputPath = path.resolve(outputPath);
  }

  async write(relativePath: string, content: string): Promise<void> {
    const resolved = path.resolve(this.outputPath, relativePath);
    if (!resolved.startsWith(this.outputPath + path.sep) && resolved !== this.outputPath) {
      throw new Error(`Path traversal detected: ${relativePath}`);
    }
    await mkdir(path.dirname(resolved), { recursive: true });
    await writeFile(resolved, content, 'utf-8');
  }

  async read(relativePath: string): Promise<string> {
    const resolved = path.resolve(this.outputPath, relativePath);
    if (!resolved.startsWith(this.outputPath + path.sep) && resolved !== this.outputPath) {
      throw new Error(`Path traversal detected: ${relativePath}`);
    }
    return readFile(resolved, 'utf-8');
  }

  async delete(absolutePath: string): Promise<void> {
    const resolved = path.resolve(absolutePath);
    if (!resolved.startsWith(this.outputPath + path.sep) && resolved !== this.outputPath) {
      throw new Error(`Path traversal detected: ${absolutePath}`);
    }
    try {
      await unlink(resolved);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  async pruneEmptyDirs(dir: string, stopAt: string): Promise<void> {
    const resolvedStop = path.resolve(stopAt);
    let current = path.resolve(dir);
    // Uses `resolvedStop + path.sep` (not just `resolvedStop`) so that a sibling path
    // like /tmp/foobarbaz never matches /tmp/foo as a false prefix. When current equals
    // resolvedStop, startsWith(resolvedStop + sep) is false, so stopAt is never deleted.
    // NOTE: intentionally differs from the spec's `current !== resolvedStop` guard —
    // the sep-suffix approach is more precise and makes the `!== resolvedStop` check redundant.
    while (current.startsWith(resolvedStop + path.sep)) {
      const entries = await readdir(current).catch(() => null);
      if (entries === null || entries.length > 0) break;
      await rmdir(current);
      current = path.dirname(current);
    }
  }

  async query(_embedding: number[]): Promise<WikiNode[]> {
    return [];
  }
}
