import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Manifest } from '../../types.js';
import { LocalMarkdownBackend } from '../LocalMarkdownBackend.js';
import { ManifestManager } from '../ManifestManager.js';

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
    const expected = `sha256:${createHash('sha256').update('export const x = 1;').digest('hex')}`;
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

  it('delete() removes an existing file', async () => {
    const backend = new LocalMarkdownBackend(tmpDir);
    const absPath = path.join(tmpDir, 'to-delete.md');
    await writeFile(absPath, '# delete me');
    await backend.delete(absPath);
    await expect(readFile(absPath)).rejects.toThrow();
  });

  it('delete() is a no-op when file does not exist', async () => {
    const backend = new LocalMarkdownBackend(tmpDir);
    const absPath = path.join(tmpDir, 'nonexistent.md');
    await expect(backend.delete(absPath)).resolves.toBeUndefined();
  });

  it('delete() throws on path traversal attempt', async () => {
    const backend = new LocalMarkdownBackend(tmpDir);
    const outsidePath = path.resolve(tmpDir, '../escape.md');
    await expect(backend.delete(outsidePath)).rejects.toThrow('Path traversal');
  });
});

describe('LocalMarkdownBackend — pruneEmptyDirs', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'repowiki-prune-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('removes a single empty directory', async () => {
    const emptyDir = path.join(tmpDir, 'empty');
    await mkdir(emptyDir, { recursive: true });
    const backend = new LocalMarkdownBackend(tmpDir);
    await backend.pruneEmptyDirs(emptyDir, tmpDir);
    await expect(stat(emptyDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('removes a chain of empty parent directories up to stopAt', async () => {
    const deepDir = path.join(tmpDir, 'a', 'b', 'c');
    await mkdir(deepDir, { recursive: true });
    const backend = new LocalMarkdownBackend(tmpDir);
    await backend.pruneEmptyDirs(deepDir, tmpDir);
    await expect(stat(path.join(tmpDir, 'a'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('stops at a non-empty directory', async () => {
    const parentDir = path.join(tmpDir, 'parent');
    const emptyChild = path.join(parentDir, 'empty-child');
    const sibling = path.join(parentDir, 'sibling.md');
    await mkdir(emptyChild, { recursive: true });
    await writeFile(sibling, 'content');
    const backend = new LocalMarkdownBackend(tmpDir);
    await backend.pruneEmptyDirs(emptyChild, tmpDir);
    await expect(stat(emptyChild)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(stat(parentDir)).resolves.toBeTruthy(); // parent kept because sibling.md remains
  });

  it('does not remove stopAt itself', async () => {
    const backend = new LocalMarkdownBackend(tmpDir);
    await backend.pruneEmptyDirs(tmpDir, tmpDir); // dir === stopAt
    await expect(stat(tmpDir)).resolves.toBeTruthy();
  });
});
