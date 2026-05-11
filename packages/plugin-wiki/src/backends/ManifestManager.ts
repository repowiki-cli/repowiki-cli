import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { Manifest } from '../types.js';

export class ManifestManager {
  private readonly manifestPath: string;
  private readonly tmpPath: string;

  constructor(outputPath: string) {
    this.manifestPath = path.join(outputPath, '.manifest.json');
    this.tmpPath = path.join(outputPath, '.manifest.json.tmp');
  }

  async load(): Promise<Manifest | null> {
    try {
      const content = await readFile(this.manifestPath, 'utf-8');
      return JSON.parse(content) as Manifest;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async save(manifest: Manifest): Promise<void> {
    await writeFile(this.tmpPath, JSON.stringify(manifest, null, 2), 'utf-8');
    await rename(this.tmpPath, this.manifestPath);
  }

  async computeHash(filePath: string): Promise<string> {
    const content = await readFile(filePath);
    return `sha256:${createHash('sha256').update(content).digest('hex')}`;
  }
}
