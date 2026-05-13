import { mkdir, mkdtemp, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { LLMProvider } from '@repowiki/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProgressEvent } from '../../progress.js';
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
  await writeFile(path.join(dir, 'src/utils.ts'), 'export const VERSION = "1.0.0";\n');
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
      quiet: false,
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
      quiet: false,
    });
    const { readdir } = await import('node:fs/promises');
    const entries = (await readdir(outputDir, { recursive: true })) as string[];
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
      quiet: false,
    });
    const manifest = JSON.parse(await readFile(path.join(outputDir, '.manifest.json'), 'utf-8'));
    expect(manifest.version).toBe(2);
    const entries = Object.values(manifest.files) as { hash: string }[];
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.hash.startsWith('sha256:'))).toBe(true);
    expect(entries.every((e) => typeof (e as { summary?: string }).summary === 'string')).toBe(
      true,
    );
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
      quiet: false,
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
      quiet: false,
    });
    expect(vi.mocked(mockProvider.complete).mock.calls.length).toBeGreaterThan(0);
  });
});

import { ManifestManager } from '../../backends/ManifestManager.js';
import type { Manifest } from '../../types.js';
import { ValidatePipeline } from '../ValidatePipeline.js';

describe('ValidatePipeline', () => {
  let tmpDir: string;
  let outputDir: string;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
    outputDir = path.join(tmpDir, '.repowiki');
    await mkdir(outputDir, { recursive: true });
    await createFixtureRepo(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('exits 1 when manifest does not exist', async () => {
    const pipeline = new ValidatePipeline();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    await pipeline.run({ repoPath: tmpDir, outputPath: outputDir });
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('exits 0 when manifest matches current source files', async () => {
    const mgr = new ManifestManager(outputDir);
    const { TypeScriptAnalyzer } = await import(
      '../../analyzers/typescript/TypeScriptAnalyzer.js'
    );
    const analyzer = new TypeScriptAnalyzer();
    const { fileMap } = await analyzer.analyzeWithFileMap(tmpDir);
    const manifestFiles: Manifest['files'] = {};
    for (const f of fileMap.keys()) {
      const hash = await mgr.computeHash(path.join(tmpDir, f));
      manifestFiles[f] = { hash, wikiPath: '' };
    }
    await mgr.save({
      version: 1,
      generatedAt: new Date().toISOString(),
      provider: 'test',
      files: manifestFiles,
    });

    const pipeline = new ValidatePipeline();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    await pipeline.run({ repoPath: tmpDir, outputPath: outputDir });
    expect(exitSpy).toHaveBeenCalledWith(0);
    exitSpy.mockRestore();
  });

  it('exits 1 and reports stale when a file changes', async () => {
    const mgr = new ManifestManager(outputDir);
    const { TypeScriptAnalyzer } = await import('../../analyzers/typescript/TypeScriptAnalyzer.js');
    const analyzer = new TypeScriptAnalyzer();
    const files = await analyzer.discoverFiles(tmpDir);
    const manifestFiles: Manifest['files'] = {};
    for (const f of files) {
      manifestFiles[f] = { hash: 'sha256:old-hash', wikiPath: '' };
    }
    await mgr.save({
      version: 1,
      generatedAt: new Date().toISOString(),
      provider: 'test',
      files: manifestFiles,
    });

    const pipeline = new ValidatePipeline();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await pipeline.run({ repoPath: tmpDir, outputPath: outputDir });
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stdoutSpy.mock.calls.some((args) => String(args[0]).includes('stale'))).toBe(true);
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it('exits 1 and reports deleted when a manifest file is missing from disk', async () => {
    const mgr = new ManifestManager(outputDir);
    const { TypeScriptAnalyzer } = await import(
      '../../analyzers/typescript/TypeScriptAnalyzer.js'
    );
    const analyzer = new TypeScriptAnalyzer();
    const { fileMap } = await analyzer.analyzeWithFileMap(tmpDir);
    const manifestFiles: Record<string, { hash: string; wikiPath: string }> = {};
    for (const f of fileMap.keys()) {
      const hash = await mgr.computeHash(path.join(tmpDir, f));
      manifestFiles[f] = { hash, wikiPath: '' };
    }
    await mgr.save({
      version: 1,
      generatedAt: new Date().toISOString(),
      provider: 'test',
      files: manifestFiles,
    });

    await unlink(path.join(tmpDir, 'src/utils.ts')); // uses static import added above

    const pipeline = new ValidatePipeline();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await pipeline.run({ repoPath: tmpDir, outputPath: outputDir });
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stdoutSpy.mock.calls.some((args) => String(args[0]).includes('deleted'))).toBe(true);
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  it('exits 1 and reports new file when a new file is added', async () => {
    const mgr = new ManifestManager(outputDir);
    const indexHash = await mgr.computeHash(path.join(tmpDir, 'src/index.ts'));
    await mgr.save({
      version: 1,
      generatedAt: new Date().toISOString(),
      provider: 'test',
      files: { 'src/index.ts': { hash: indexHash, wikiPath: '' } },
    });

    const pipeline = new ValidatePipeline();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await pipeline.run({ repoPath: tmpDir, outputPath: outputDir });
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stdoutSpy.mock.calls.some((args) => String(args[0]).includes('new'))).toBe(true);
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
  });
});

describe('GeneratePipeline – progress events', () => {
  let tmpDir: string;
  let outputDir: string;
  const progressProvider: LLMProvider = {
    complete: vi.fn().mockResolvedValue('mock summary'),
  };

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
    outputDir = path.join(tmpDir, '.repowiki');
    await createFixtureRepo(tmpDir);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('emits analyze:start then analyze:done as first two events', async () => {
    const events: ProgressEvent[] = [];
    await new GeneratePipeline(progressProvider).run({
      provider: 'openai',
      dryRun: false,
      estimate: false,
      concurrency: 2,
      repoPath: tmpDir,
      outputPath: outputDir,
      quiet: false,
      onProgress: (e) => events.push(e),
    });
    expect(events[0].type).toBe('analyze:start');
    expect(events[1].type).toBe('analyze:done');
  });

  it('emits one summarize-modules:item per module', async () => {
    const events: ProgressEvent[] = [];
    await new GeneratePipeline(progressProvider).run({
      provider: 'openai',
      dryRun: false,
      estimate: false,
      concurrency: 2,
      repoPath: tmpDir,
      outputPath: outputDir,
      quiet: false,
      onProgress: (e) => events.push(e),
    });
    const items = events.filter((e) => e.type === 'summarize-modules:item');
    // fixture has 2 source files: src/index.ts and src/utils.ts
    expect(items).toHaveLength(2);
  });

  it('finished.llmCalls equals the number of provider.complete calls', async () => {
    const events: ProgressEvent[] = [];
    await new GeneratePipeline(progressProvider).run({
      provider: 'openai',
      dryRun: false,
      estimate: false,
      concurrency: 2,
      repoPath: tmpDir,
      outputPath: outputDir,
      quiet: false,
      onProgress: (e) => events.push(e),
    });
    const finished = events.find((e) => e.type === 'finished') as Extract<
      ProgressEvent,
      { type: 'finished' }
    >;
    expect(finished).toBeDefined();
    expect(vi.mocked(progressProvider.complete).mock.calls.length).toBe(finished.llmCalls);
  });

  it('finished is the last event', async () => {
    const events: ProgressEvent[] = [];
    await new GeneratePipeline(progressProvider).run({
      provider: 'openai',
      dryRun: false,
      estimate: false,
      concurrency: 2,
      repoPath: tmpDir,
      outputPath: outputDir,
      quiet: false,
      onProgress: (e) => events.push(e),
    });
    expect(events.at(-1)?.type).toBe('finished');
  });

  it('a throwing reporter does not abort the pipeline', async () => {
    await expect(
      new GeneratePipeline(progressProvider).run({
        provider: 'openai',
        dryRun: false,
        estimate: false,
        concurrency: 2,
        repoPath: tmpDir,
        outputPath: outputDir,
        quiet: false,
        onProgress: () => {
          throw new Error('reporter blew up');
        },
      }),
    ).resolves.not.toThrow();
  });

  it('emits abort event then re-throws on non-429 LLM error', async () => {
    const failingProvider: LLMProvider = {
      complete: vi.fn().mockRejectedValue(Object.assign(new Error('API error'), { status: 500 })),
    };
    const events: ProgressEvent[] = [];
    await expect(
      new GeneratePipeline(failingProvider).run({
        provider: 'openai',
        dryRun: false,
        estimate: false,
        concurrency: 2,
        repoPath: tmpDir,
        outputPath: outputDir,
        quiet: false,
        onProgress: (e) => events.push(e),
      }),
    ).rejects.toThrow('API error');
    expect(events.some((e) => e.type === 'abort')).toBe(true);
  });
});
