import { mkdir, mkdtemp, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises';
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

async function createMonorepoFixture(dir: string): Promise<void> {
  await writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'my-project' }));
  await mkdir(path.join(dir, 'packages/core/src'), { recursive: true });
  await writeFile(
    path.join(dir, 'packages/core/package.json'),
    JSON.stringify({ name: '@my/core' }),
  );
  await writeFile(
    path.join(dir, 'packages/core/src/index.ts'),
    'export interface Foo { bar: string }',
  );
  await mkdir(path.join(dir, 'old'), { recursive: true });
  await writeFile(path.join(dir, 'old/legacy.ts'), 'export const LEGACY = true;');
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
    await pipeline.run({
      provider: 'openai',
      repoPath: tmpDir,
      outputPath: outputDir,
      concurrency: 2,
    });
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stdoutSpy.mock.calls.some((a) => String(a[0]).includes('wiki generate'))).toBe(true);
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it('exits 1 when manifest is v1 (no summaries)', async () => {
    await mkdir(outputDir, { recursive: true });
    const { ManifestManager } = await import('../../backends/ManifestManager.js');
    const mgr = new ManifestManager(outputDir);
    await mgr.save({
      version: 1,
      generatedAt: new Date().toISOString(),
      provider: 'openai',
      files: {},
    });

    const pipeline = new UpdatePipeline(mockProvider);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await pipeline.run({
      provider: 'openai',
      repoPath: tmpDir,
      outputPath: outputDir,
      concurrency: 2,
    });
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stdoutSpy.mock.calls.some((a) => String(a[0]).includes('outdated'))).toBe(true);
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it('exits 0 and makes no LLM calls when nothing changed', async () => {
    const generateProvider: LLMProvider = { complete: vi.fn().mockResolvedValue('gen summary') };
    await new GeneratePipeline(generateProvider).run({
      provider: 'openai',
      dryRun: false,
      estimate: false,
      concurrency: 2,
      repoPath: tmpDir,
      outputPath: outputDir,
      quiet: false,
    });

    const updateProvider: LLMProvider = { complete: vi.fn() };
    const pipeline = new UpdatePipeline(updateProvider);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await pipeline.run({
      provider: 'openai',
      repoPath: tmpDir,
      outputPath: outputDir,
      concurrency: 2,
    });
    expect(vi.mocked(updateProvider.complete)).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(stdoutSpy.mock.calls.some((a) => String(a[0]).includes('up to date'))).toBe(true);
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it('re-summarizes only the stale file and updates manifest', async () => {
    const generateProvider: LLMProvider = { complete: vi.fn().mockResolvedValue('gen summary') };
    await new GeneratePipeline(generateProvider).run({
      provider: 'openai',
      dryRun: false,
      estimate: false,
      concurrency: 2,
      repoPath: tmpDir,
      outputPath: outputDir,
      quiet: false,
    });
    const genCallCount = vi.mocked(generateProvider.complete).mock.calls.length;

    await writeFile(path.join(tmpDir, 'src/utils.ts'), 'export const VERSION = "2.0.0";\n');

    const updateProvider: LLMProvider = { complete: vi.fn().mockResolvedValue('updated summary') };
    await new UpdatePipeline(updateProvider).run({
      provider: 'openai',
      repoPath: tmpDir,
      outputPath: outputDir,
      concurrency: 2,
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
      provider: 'openai',
      dryRun: false,
      estimate: false,
      concurrency: 2,
      repoPath: tmpDir,
      outputPath: outputDir,
      quiet: false,
    });

    const manifestBefore = JSON.parse(
      await readFile(path.join(outputDir, '.manifest.json'), 'utf-8'),
    );
    const utilsWikiPath = path.resolve(tmpDir, manifestBefore.files['src/utils.ts'].wikiPath);
    await expect(readFile(utilsWikiPath)).resolves.toBeTruthy();

    await unlink(path.join(tmpDir, 'src/utils.ts'));

    await new UpdatePipeline({ complete: vi.fn().mockResolvedValue('updated') } as LLMProvider).run(
      {
        provider: 'openai',
        repoPath: tmpDir,
        outputPath: outputDir,
        concurrency: 2,
      },
    );

    await expect(readFile(utilsWikiPath)).rejects.toThrow();

    const manifest = JSON.parse(await readFile(path.join(outputDir, '.manifest.json'), 'utf-8'));
    expect(Object.keys(manifest.files)).not.toContain('src/utils.ts');
  });

  it('writes wiki file for a new source file and adds manifest entry', async () => {
    await new GeneratePipeline({ complete: vi.fn().mockResolvedValue('gen') } as LLMProvider).run({
      provider: 'openai',
      dryRun: false,
      estimate: false,
      concurrency: 2,
      repoPath: tmpDir,
      outputPath: outputDir,
      quiet: false,
    });

    await writeFile(path.join(tmpDir, 'src/new-module.ts'), 'export const X = 42;\n');

    await new UpdatePipeline({
      complete: vi.fn().mockResolvedValue('new summary'),
    } as LLMProvider).run({
      provider: 'openai',
      repoPath: tmpDir,
      outputPath: outputDir,
      concurrency: 2,
    });

    const manifest = JSON.parse(await readFile(path.join(outputDir, '.manifest.json'), 'utf-8'));
    expect(manifest.files['src/new-module.ts']).toBeDefined();
    expect(manifest.files['src/new-module.ts'].summary).toBe('new summary');

    const newWikiPath = path.resolve(tmpDir, manifest.files['src/new-module.ts'].wikiPath);
    const newWiki = await readFile(newWikiPath, 'utf-8');
    expect(newWiki).toContain('new summary');
  });

  it('prunes empty wiki directories after a loose source file is deleted', async () => {
    const monorepoDir = await makeTmpDir();
    const monorepoOutput = path.join(monorepoDir, '.repowiki');
    try {
      await createMonorepoFixture(monorepoDir);

      await new GeneratePipeline({
        complete: vi.fn().mockResolvedValue('gen summary'),
      } as LLMProvider).run({
        provider: 'openai',
        dryRun: false,
        estimate: false,
        concurrency: 2,
        repoPath: monorepoDir,
        outputPath: monorepoOutput,
        quiet: false,
      });

      const manifestBefore = JSON.parse(
        await readFile(path.join(monorepoOutput, '.manifest.json'), 'utf-8'),
      );
      expect(manifestBefore.files['old/legacy.ts']).toBeDefined();
      const legacyWikiPath = path.resolve(
        monorepoDir,
        manifestBefore.files['old/legacy.ts'].wikiPath,
      );
      await readFile(legacyWikiPath); // verify wiki file exists before deletion

      await unlink(path.join(monorepoDir, 'old/legacy.ts'));

      await new UpdatePipeline({
        complete: vi.fn().mockResolvedValue('updated'),
      } as LLMProvider).run({
        provider: 'openai',
        repoPath: monorepoDir,
        outputPath: monorepoOutput,
        concurrency: 2,
      });

      await expect(readFile(legacyWikiPath)).rejects.toThrow(); // wiki file removed
      // Verify the directory's _index.md was also cleaned up (not just the module file)
      const legacyDirIndexPath = path.join(path.dirname(legacyWikiPath), '_index.md');
      await expect(readFile(legacyDirIndexPath)).rejects.toThrow(); // _index.md removed
      await expect(stat(path.dirname(legacyWikiPath))).rejects.toMatchObject({ code: 'ENOENT' }); // empty parent dir pruned

      const manifestAfter = JSON.parse(
        await readFile(path.join(monorepoOutput, '.manifest.json'), 'utf-8'),
      );
      expect(Object.keys(manifestAfter.files)).not.toContain('old/legacy.ts');
    } finally {
      await rm(monorepoDir, { recursive: true, force: true });
    }
  });
});
