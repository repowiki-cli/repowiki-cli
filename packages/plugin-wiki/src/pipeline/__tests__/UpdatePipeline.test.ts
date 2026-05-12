import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { LLMProvider } from '@repowiki/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeneratePipeline } from '../GeneratePipeline.js';
import { UpdatePipeline } from '../UpdatePipeline.js';

async function makeTmpDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'repowiki-update-'));
}

async function createFixtureRepo(dir: string): Promise<void> {
  await mkdir(path.join(dir, 'src'), { recursive: true });
  // 固定项目名，避免测试中路径不可预测
  await writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'test-fixture' }));
  await writeFile(
    path.join(dir, 'src/index.ts'),
    'export interface Foo { bar: string }\nexport function doSomething(): void {}\n',
  );
  await writeFile(path.join(dir, 'src/utils.ts'), 'export const VERSION = "1.0.0";\n');
}

describe('UpdatePipeline', () => {
  let tmpDir: string;
  let outputDir: string;
  let mockProvider: LLMProvider;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
    outputDir = path.join(tmpDir, '.repowiki');
    await createFixtureRepo(tmpDir);
    mockProvider = { complete: vi.fn().mockResolvedValue('mock summary') };
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('exits 1 when no manifest exists', async () => {
    await mkdir(outputDir, { recursive: true });
    const pipeline = new UpdatePipeline(mockProvider);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await pipeline.run({ provider: 'openai', repoPath: tmpDir, outputPath: outputDir, concurrency: 2 });
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stdoutSpy.mock.calls.some((a) => String(a[0]).includes('wiki generate'))).toBe(true);
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it('exits 1 when manifest is v1 (no summaries)', async () => {
    await mkdir(outputDir, { recursive: true });
    const { ManifestManager } = await import('../../backends/ManifestManager.js');
    const mgr = new ManifestManager(outputDir);
    await mgr.save({ version: 1, generatedAt: new Date().toISOString(), provider: 'openai', files: {} });

    const pipeline = new UpdatePipeline(mockProvider);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await pipeline.run({ provider: 'openai', repoPath: tmpDir, outputPath: outputDir, concurrency: 2 });
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stdoutSpy.mock.calls.some((a) => String(a[0]).includes('outdated'))).toBe(true);
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it('exits 0 and makes no LLM calls when nothing changed', async () => {
    const generateProvider: LLMProvider = { complete: vi.fn().mockResolvedValue('gen summary') };
    await new GeneratePipeline(generateProvider).run({
      provider: 'openai', dryRun: false, estimate: false, concurrency: 2,
      repoPath: tmpDir, outputPath: outputDir,
    });

    const updateProvider: LLMProvider = { complete: vi.fn() };
    const pipeline = new UpdatePipeline(updateProvider);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await pipeline.run({ provider: 'openai', repoPath: tmpDir, outputPath: outputDir, concurrency: 2 });
    expect(vi.mocked(updateProvider.complete)).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(stdoutSpy.mock.calls.some((a) => String(a[0]).includes('up to date'))).toBe(true);
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it('re-summarizes only the stale file and updates manifest', async () => {
    const generateProvider: LLMProvider = { complete: vi.fn().mockResolvedValue('gen summary') };
    await new GeneratePipeline(generateProvider).run({
      provider: 'openai', dryRun: false, estimate: false, concurrency: 2,
      repoPath: tmpDir, outputPath: outputDir,
    });
    const genCallCount = vi.mocked(generateProvider.complete).mock.calls.length;

    await writeFile(path.join(tmpDir, 'src/utils.ts'), 'export const VERSION = "2.0.0";\n');

    const updateProvider: LLMProvider = { complete: vi.fn().mockResolvedValue('updated summary') };
    await new UpdatePipeline(updateProvider).run({
      provider: 'openai', repoPath: tmpDir, outputPath: outputDir, concurrency: 2,
    });

    expect(vi.mocked(updateProvider.complete).mock.calls.length).toBeLessThan(genCallCount);

    const manifest = JSON.parse(await readFile(path.join(outputDir, '.manifest.json'), 'utf-8'));
    expect(manifest.files['src/utils.ts'].summary).toBe('updated summary');

    const utilsWikiPath = path.resolve(tmpDir, manifest.files['src/utils.ts'].wikiPath);
    const utilsWiki = await readFile(utilsWikiPath, 'utf-8');
    expect(utilsWiki).toContain('updated summary');
  });

  it('deletes wiki file and manifest entry for a deleted source file', async () => {
    await new GeneratePipeline({ complete: vi.fn().mockResolvedValue('gen') } as LLMProvider).run({
      provider: 'openai', dryRun: false, estimate: false, concurrency: 2,
      repoPath: tmpDir, outputPath: outputDir,
    });

    const manifestBefore = JSON.parse(await readFile(path.join(outputDir, '.manifest.json'), 'utf-8'));
    const utilsWikiPath = path.resolve(tmpDir, manifestBefore.files['src/utils.ts'].wikiPath);
    await expect(readFile(utilsWikiPath)).resolves.toBeTruthy();

    const { unlink } = await import('node:fs/promises');
    await unlink(path.join(tmpDir, 'src/utils.ts'));

    await new UpdatePipeline({ complete: vi.fn().mockResolvedValue('updated') } as LLMProvider).run({
      provider: 'openai', repoPath: tmpDir, outputPath: outputDir, concurrency: 2,
    });

    await expect(readFile(utilsWikiPath)).rejects.toThrow();

    const manifest = JSON.parse(await readFile(path.join(outputDir, '.manifest.json'), 'utf-8'));
    expect(Object.keys(manifest.files)).not.toContain('src/utils.ts');
  });

  it('writes wiki file for a new source file and adds manifest entry', async () => {
    await new GeneratePipeline({ complete: vi.fn().mockResolvedValue('gen') } as LLMProvider).run({
      provider: 'openai', dryRun: false, estimate: false, concurrency: 2,
      repoPath: tmpDir, outputPath: outputDir,
    });

    await writeFile(path.join(tmpDir, 'src/new-module.ts'), 'export const X = 42;\n');

    await new UpdatePipeline({ complete: vi.fn().mockResolvedValue('new summary') } as LLMProvider).run({
      provider: 'openai', repoPath: tmpDir, outputPath: outputDir, concurrency: 2,
    });

    const manifest = JSON.parse(await readFile(path.join(outputDir, '.manifest.json'), 'utf-8'));
    expect(manifest.files['src/new-module.ts']).toBeDefined();
    expect(manifest.files['src/new-module.ts'].summary).toBe('new summary');

    const newWikiPath = path.resolve(tmpDir, manifest.files['src/new-module.ts'].wikiPath);
    const newWiki = await readFile(newWikiPath, 'utf-8');
    expect(newWiki).toContain('new summary');
  });
});
