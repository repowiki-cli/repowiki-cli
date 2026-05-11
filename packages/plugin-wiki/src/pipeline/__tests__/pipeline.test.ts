import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LLMProvider } from '@repowiki/core';
import { GeneratePipeline } from '../GeneratePipeline.js';

async function makeTmpDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'repowiki-pipeline-'));
}

async function createFixtureRepo(dir: string): Promise<void> {
  await mkdir(path.join(dir, 'src'), { recursive: true });
  await writeFile(
    path.join(dir, 'src/index.ts'),
    'export interface Foo { bar: string }\nexport function doSomething(): void {}\n',
  );
  await writeFile(
    path.join(dir, 'src/utils.ts'),
    'export const VERSION = "1.0.0";\n',
  );
}

const mockProvider: LLMProvider = {
  complete: vi.fn().mockResolvedValue('mock summary'),
};

describe('GeneratePipeline', () => {
  let tmpDir: string;
  let outputDir: string;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
    outputDir = path.join(tmpDir, '.repowiki');
    await createFixtureRepo(tmpDir);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('writes _index.md to outputPath', async () => {
    const pipeline = new GeneratePipeline(mockProvider);
    await pipeline.run({
      provider: 'openai',
      dryRun: false,
      estimate: false,
      concurrency: 2,
      repoPath: tmpDir,
      outputPath: outputDir,
    });
    const content = await readFile(path.join(outputDir, '_index.md'), 'utf-8');
    expect(content).toContain('# ');
  });

  it('writes per-module .md files', async () => {
    const pipeline = new GeneratePipeline(mockProvider);
    await pipeline.run({
      provider: 'openai',
      dryRun: false,
      estimate: false,
      concurrency: 2,
      repoPath: tmpDir,
      outputPath: outputDir,
    });
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(outputDir, { recursive: true }) as string[];
    const mdFiles = entries.filter((e) => e.endsWith('.md') && !e.includes('_index'));
    expect(mdFiles.length).toBeGreaterThan(0);
  });

  it('writes .manifest.json with sha256 hashes', async () => {
    const pipeline = new GeneratePipeline(mockProvider);
    await pipeline.run({
      provider: 'openai',
      dryRun: false,
      estimate: false,
      concurrency: 2,
      repoPath: tmpDir,
      outputPath: outputDir,
    });
    const manifest = JSON.parse(await readFile(path.join(outputDir, '.manifest.json'), 'utf-8'));
    expect(manifest.version).toBe(1);
    const entries = Object.values(manifest.files) as { hash: string }[];
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.hash.startsWith('sha256:'))).toBe(true);
  });

  it('--dry-run writes no files', async () => {
    const pipeline = new GeneratePipeline(mockProvider);
    await pipeline.run({
      provider: 'openai',
      dryRun: true,
      estimate: false,
      concurrency: 2,
      repoPath: tmpDir,
      outputPath: outputDir,
    });
    await expect(stat(outputDir)).rejects.toThrow();
  });

  it('LLM complete() is called for nodes', async () => {
    const pipeline = new GeneratePipeline(mockProvider);
    await pipeline.run({
      provider: 'openai',
      dryRun: false,
      estimate: false,
      concurrency: 2,
      repoPath: tmpDir,
      outputPath: outputDir,
    });
    expect(vi.mocked(mockProvider.complete).mock.calls.length).toBeGreaterThan(0);
  });
});
