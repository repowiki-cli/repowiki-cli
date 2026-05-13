import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
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

  async query(_embedding: number[]): Promise<WikiNode[]> {
    return [];
  }
}
