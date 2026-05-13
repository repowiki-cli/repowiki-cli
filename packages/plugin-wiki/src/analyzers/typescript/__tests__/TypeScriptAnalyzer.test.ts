import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TypeScriptAnalyzer } from '../TypeScriptAnalyzer.js';

// The repo root of repowiki-cli itself — used as a real fixture
const REPO_ROOT = path.resolve(__dirname, '../../../../../../');

describe('TypeScriptAnalyzer', () => {
  describe('discoverFiles()', () => {
    it('finds TypeScript source files', async () => {
      const analyzer = new TypeScriptAnalyzer();
      const files = await analyzer.discoverFiles(path.join(REPO_ROOT, 'packages/core'));
      expect(files.length).toBeGreaterThan(0);
      expect(files.every((f) => /\.(ts|tsx|js|jsx)$/.test(f))).toBe(true);
    });

    it('excludes test files', async () => {
      const analyzer = new TypeScriptAnalyzer();
      const files = await analyzer.discoverFiles(path.join(REPO_ROOT, 'packages/core'));
      expect(files.every((f) => !f.includes('__tests__'))).toBe(true);
      expect(files.every((f) => !f.includes('.test.'))).toBe(true);
    });
  });

  describe('analyze() — tree structure', () => {
    it('returns array of length 1 with project root', async () => {
      const analyzer = new TypeScriptAnalyzer();
      const result = await analyzer.analyze(REPO_ROOT);
      expect(result).toHaveLength(1);
      expect((result[0] as import('../../types.js').AnalyzedNode).type).toBe('project');
    });

    it('root has package children for monorepo', async () => {
      const analyzer = new TypeScriptAnalyzer();
      const [root] = (await analyzer.analyze(REPO_ROOT)) as import('../../types.js').AnalyzedNode[];
      // Loose files may also appear as non-package children — assert at least one package exists
      expect(root.children.some((c) => c.type === 'package')).toBe(true);
      // Verify a known package is present to prevent a regression where packages disappear
      expect(root.children.some((c) => c.type === 'package' && c.path === 'core')).toBe(true);
    });

    it('core package node has correct path', async () => {
      const analyzer = new TypeScriptAnalyzer();
      const [root] = (await analyzer.analyze(REPO_ROOT)) as import('../../types.js').AnalyzedNode[];
      const corePkg = root.children.find((c) => c.path === 'core');
      expect(corePkg).toBeDefined();
      expect(corePkg?.type).toBe('package');
    });

    it('core package contains module node for src/index', async () => {
      const analyzer = new TypeScriptAnalyzer();
      const [root] = (await analyzer.analyze(REPO_ROOT)) as import('../../types.js').AnalyzedNode[];
      // biome-ignore lint/style/noNonNullAssertion: test assertion — value is guaranteed by prior expect()
      const corePkg = root.children.find((c) => c.path === 'core')!;
      const allModules = collectAllModules(corePkg);
      const indexModule = allModules.find((m) => m.path === 'core/src/index');
      expect(indexModule).toBeDefined();
    });

    it('all summary fields are empty strings initially', async () => {
      const analyzer = new TypeScriptAnalyzer();
      const [root] = (await analyzer.analyze(REPO_ROOT)) as import('../../types.js').AnalyzedNode[];
      const allNodes = collectAll(root);
      expect(allNodes.every((n) => n.summary === '')).toBe(true);
    });

    it('node.path contains no .. segments', async () => {
      const analyzer = new TypeScriptAnalyzer();
      const [root] = (await analyzer.analyze(REPO_ROOT)) as import('../../types.js').AnalyzedNode[];
      const allNodes = collectAll(root);
      expect(allNodes.every((n) => !n.path.includes('..'))).toBe(true);
    });
  });

  describe('analyze() — exports (Tree-sitter)', () => {
    it('core/src/index module has 6 exports', async () => {
      const analyzer = new TypeScriptAnalyzer();
      const [root] = (await analyzer.analyze(REPO_ROOT)) as import('../../types.js').AnalyzedNode[];
      // biome-ignore lint/style/noNonNullAssertion: test assertion — value is guaranteed by prior expect()
      const corePkg = root.children.find((c) => c.path === 'core')!;
      const allModules = collectAllModules(corePkg);
      // biome-ignore lint/style/noNonNullAssertion: test assertion — value is guaranteed by prior expect()
      const indexModule = allModules.find((m) => m.path === 'core/src/index')!;
      expect(indexModule.exports).toHaveLength(6);
    });

    it('core/src/index exports include all expected names', async () => {
      const analyzer = new TypeScriptAnalyzer();
      const [root] = (await analyzer.analyze(REPO_ROOT)) as import('../../types.js').AnalyzedNode[];
      // biome-ignore lint/style/noNonNullAssertion: test assertion — value is guaranteed by prior expect()
      const corePkg = root.children.find((c) => c.path === 'core')!;
      const allModules = collectAllModules(corePkg);
      // biome-ignore lint/style/noNonNullAssertion: test assertion — value is guaranteed by prior expect()
      const indexModule = allModules.find((m) => m.path === 'core/src/index')!;
      const names = indexModule.exports.map((e) => e.name);
      expect(names).toContain('WikiNode');
      expect(names).toContain('LLMProvider');
      expect(names).toContain('OutputBackend');
      expect(names).toContain('Analyzer');
      expect(names).toContain('ChatMessage');
      expect(names).toContain('RepowikiConfig');
    });

    it('export kinds are all interface', async () => {
      const analyzer = new TypeScriptAnalyzer();
      const [root] = (await analyzer.analyze(REPO_ROOT)) as import('../../types.js').AnalyzedNode[];
      // biome-ignore lint/style/noNonNullAssertion: test assertion — value is guaranteed by prior expect()
      const corePkg = root.children.find((c) => c.path === 'core')!;
      const allModules = collectAllModules(corePkg);
      // biome-ignore lint/style/noNonNullAssertion: test assertion — value is guaranteed by prior expect()
      const indexModule = allModules.find((m) => m.path === 'core/src/index')!;
      expect(indexModule.exports.every((e) => e.kind === 'interface')).toBe(true);
    });
  });
});

describe('analyzeWithFileMap()', () => {
  it('returns root and fileMap with source file keys', async () => {
    const analyzer = new TypeScriptAnalyzer();
    const { root, fileMap } = (await analyzer.analyzeWithFileMap(REPO_ROOT)) as {
      root: import('../../types.js').AnalyzedNode;
      fileMap: Map<string, import('../../types.js').AnalyzedNode>;
    };
    expect(root.type).toBe('project');
    expect(fileMap.size).toBeGreaterThan(0);
    // All keys should be relative paths with extensions
    for (const key of fileMap.keys()) {
      expect(key).toMatch(/\.(ts|tsx|js|jsx)$/);
      expect(key).not.toContain('..');
    }
    // All values should be module-type nodes
    for (const node of fileMap.values()) {
      expect(node.type).toBe('module');
    }
  });

  it('fileMap keys match the original source file paths', async () => {
    const analyzer = new TypeScriptAnalyzer();
    const { fileMap } = (await analyzer.analyzeWithFileMap(REPO_ROOT)) as {
      root: import('../../types.js').AnalyzedNode;
      fileMap: Map<string, import('../../types.js').AnalyzedNode>;
    };
    // core/src/index.ts should be a key
    const coreIndexKey = 'packages/core/src/index.ts';
    expect(fileMap.has(coreIndexKey)).toBe(true);
    // biome-ignore lint/style/noNonNullAssertion: test assertion — value is guaranteed by prior expect()
    const node = fileMap.get(coreIndexKey)!;
    expect(node.path).toBe('core/src/index');
    expect(node.type).toBe('module');
  });
});

function collectAll(
  node: import('../../types.js').AnalyzedNode,
): import('../../types.js').AnalyzedNode[] {
  const result: import('../../types.js').AnalyzedNode[] = [node];
  for (const child of node.children) result.push(...collectAll(child));
  return result;
}

function collectAllModules(
  node: import('../../types.js').AnalyzedNode,
): import('../../types.js').AnalyzedNode[] {
  return collectAll(node).filter((n) => n.type === 'module');
}

describe('TypeScriptAnalyzer — monorepo with loose files', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'repowiki-loose-'));
    await writeFile(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'my-project' }));
    await mkdir(path.join(tmpDir, 'packages/core/src'), { recursive: true });
    await writeFile(
      path.join(tmpDir, 'packages/core/package.json'),
      JSON.stringify({ name: '@my/core' }),
    );
    await writeFile(
      path.join(tmpDir, 'packages/core/src/index.ts'),
      'export interface Foo { bar: string }',
    );
    await mkdir(path.join(tmpDir, 'scripts'), { recursive: true });
    await writeFile(path.join(tmpDir, 'scripts/build.js'), '// build script');
    await writeFile(path.join(tmpDir, 'setup.ts'), 'export const setup = true;');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('fileMap includes loose files outside packages/', async () => {
    const analyzer = new TypeScriptAnalyzer();
    const { fileMap } = await analyzer.analyzeWithFileMap(tmpDir);
    expect(fileMap.has('scripts/build.js')).toBe(true);
    expect(fileMap.has('setup.ts')).toBe(true);
    expect(fileMap.has('packages/core/src/index.ts')).toBe(true);
  });

  it('loose file node paths have no leading slash', async () => {
    const analyzer = new TypeScriptAnalyzer();
    const { fileMap } = await analyzer.analyzeWithFileMap(tmpDir);
    const buildNode = fileMap.get('scripts/build.js');
    expect(buildNode?.path).toBe('scripts/build');
    const setupNode = fileMap.get('setup.ts');
    expect(setupNode?.path).toBe('setup');
  });

  it('loose files in a subdirectory are grouped into a directory node on root', async () => {
    const analyzer = new TypeScriptAnalyzer();
    const { root } = (await analyzer.analyzeWithFileMap(tmpDir)) as {
      root: import('../../types.js').AnalyzedNode;
      fileMap: Map<string, import('../../types.js').AnalyzedNode>;
    };
    const scriptsNode = root.children.find((c) => c.path === 'scripts');
    expect(scriptsNode).toBeDefined();
    expect(scriptsNode?.type).toBe('directory');
  });

  it('package nodes and loose-file nodes coexist as root.children', async () => {
    const analyzer = new TypeScriptAnalyzer();
    const { root } = (await analyzer.analyzeWithFileMap(tmpDir)) as {
      root: import('../../types.js').AnalyzedNode;
      fileMap: Map<string, import('../../types.js').AnalyzedNode>;
    };
    const coreNode = root.children.find((c) => c.type === 'package' && c.path === 'core');
    expect(coreNode).toBeDefined();
    const scriptsNode = root.children.find((c) => c.path === 'scripts');
    expect(scriptsNode).toBeDefined();
  });
});
