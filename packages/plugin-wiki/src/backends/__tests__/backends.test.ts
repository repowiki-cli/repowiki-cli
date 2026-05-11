import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Manifest } from '../../types.js';
import { ManifestManager } from '../ManifestManager.js';
import { LocalMarkdownBackend } from '../LocalMarkdownBackend.js';

describe('ManifestManager', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'repowiki-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('load() returns null when manifest does not exist', async () => {
    const mgr = new ManifestManager(tmpDir);
    const result = await mgr.load();
    expect(result).toBeNull();
  });

  it('save() then load() round-trips correctly', async () => {
    const mgr = new ManifestManager(tmpDir);
    const manifest: Manifest = {
      version: 1,
      generatedAt: '2026-01-01T00:00:00.000Z',
      provider: 'anthropic',
      files: {
        'src/index.ts': { hash: 'sha256:abc', wikiPath: '.repowiki/src/index.md' },
      },
    };
    await mgr.save(manifest);
    const loaded = await mgr.load();
    expect(loaded).toEqual(manifest);
  });

  it('save() uses atomic write (writes .tmp then renames)', async () => {
    const mgr = new ManifestManager(tmpDir);
    const manifest: Manifest = {
      version: 1,
      generatedAt: new Date().toISOString(),
      provider: 'openai',
      files: {},
    };
    await mgr.save(manifest);
    // .tmp file should be gone after save
    await expect(readFile(path.join(tmpDir, '.manifest.json.tmp'))).rejects.toThrow();
    // manifest should exist
    const content = await readFile(path.join(tmpDir, '.manifest.json'), 'utf-8');
    expect(JSON.parse(content)).toEqual(manifest);
  });

  it('computeHash() returns sha256: prefixed string matching manual hash', async () => {
    const mgr = new ManifestManager(tmpDir);
    const filePath = path.join(tmpDir, 'test.ts');
    await writeFile(filePath, 'export const x = 1;');
    const hash = await mgr.computeHash(filePath);
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    const expected = 'sha256:' + createHash('sha256').update('export const x = 1;').digest('hex');
    expect(hash).toBe(expected);
  });
});

describe('LocalMarkdownBackend', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'repowiki-backend-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('write() creates file and intermediate directories', async () => {
    const backend = new LocalMarkdownBackend(tmpDir);
    await backend.write('core/src/index.md', '# Hello');
    const content = await readFile(path.join(tmpDir, 'core/src/index.md'), 'utf-8');
    expect(content).toBe('# Hello');
  });

  it('read() returns file content', async () => {
    const backend = new LocalMarkdownBackend(tmpDir);
    await backend.write('test.md', 'content');
    const result = await backend.read('test.md');
    expect(result).toBe('content');
  });

  it('write() throws on path traversal attempt', async () => {
    const backend = new LocalMarkdownBackend(tmpDir);
    await expect(backend.write('../escape.md', 'bad')).rejects.toThrow('Path traversal');
  });

  it('read() throws on path traversal attempt', async () => {
    const backend = new LocalMarkdownBackend(tmpDir);
    await expect(backend.read('../escape.md')).rejects.toThrow('Path traversal');
  });

  it('query() returns empty array', async () => {
    const backend = new LocalMarkdownBackend(tmpDir);
    const result = await backend.query([1, 2, 3]);
    expect(result).toEqual([]);
  });
});
