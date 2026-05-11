import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
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
      const [root] = await analyzer.analyze(REPO_ROOT) as import('../../types.js').AnalyzedNode[];
      expect(root.children.every((c) => c.type === 'package')).toBe(true);
    });

    it('core package node has correct path', async () => {
      const analyzer = new TypeScriptAnalyzer();
      const [root] = await analyzer.analyze(REPO_ROOT) as import('../../types.js').AnalyzedNode[];
      const corePkg = root.children.find((c) => c.path === 'core');
      expect(corePkg).toBeDefined();
      expect(corePkg!.type).toBe('package');
    });

    it('core package contains module node for src/index', async () => {
      const analyzer = new TypeScriptAnalyzer();
      const [root] = await analyzer.analyze(REPO_ROOT) as import('../../types.js').AnalyzedNode[];
      const corePkg = root.children.find((c) => c.path === 'core')!;
      const allModules = collectAllModules(corePkg);
      const indexModule = allModules.find((m) => m.path === 'core/src/index');
      expect(indexModule).toBeDefined();
    });

    it('all summary fields are empty strings initially', async () => {
      const analyzer = new TypeScriptAnalyzer();
      const [root] = await analyzer.analyze(REPO_ROOT) as import('../../types.js').AnalyzedNode[];
      const allNodes = collectAll(root);
      expect(allNodes.every((n) => n.summary === '')).toBe(true);
    });

    it('node.path contains no .. segments', async () => {
      const analyzer = new TypeScriptAnalyzer();
      const [root] = await analyzer.analyze(REPO_ROOT) as import('../../types.js').AnalyzedNode[];
      const allNodes = collectAll(root);
      expect(allNodes.every((n) => !n.path.includes('..'))).toBe(true);
    });
  });

  describe('analyze() — exports (Tree-sitter)', () => {
    it('core/src/index module has 6 exports', async () => {
      const analyzer = new TypeScriptAnalyzer();
      const [root] = await analyzer.analyze(REPO_ROOT) as import('../../types.js').AnalyzedNode[];
      const corePkg = root.children.find((c) => c.path === 'core')!;
      const allModules = collectAllModules(corePkg);
      const indexModule = allModules.find((m) => m.path === 'core/src/index')!;
      expect(indexModule.exports).toHaveLength(6);
    });

    it('core/src/index exports include all expected names', async () => {
      const analyzer = new TypeScriptAnalyzer();
      const [root] = await analyzer.analyze(REPO_ROOT) as import('../../types.js').AnalyzedNode[];
      const corePkg = root.children.find((c) => c.path === 'core')!;
      const allModules = collectAllModules(corePkg);
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
      const [root] = await analyzer.analyze(REPO_ROOT) as import('../../types.js').AnalyzedNode[];
      const corePkg = root.children.find((c) => c.path === 'core')!;
      const allModules = collectAllModules(corePkg);
      const indexModule = allModules.find((m) => m.path === 'core/src/index')!;
      expect(indexModule.exports.every((e) => e.kind === 'interface')).toBe(true);
    });
  });
});

describe('analyzeWithFileMap()', () => {
  it('returns root and fileMap with source file keys', async () => {
    const analyzer = new TypeScriptAnalyzer();
    const { root, fileMap } = await analyzer.analyzeWithFileMap(REPO_ROOT) as {
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
    const { fileMap } = await analyzer.analyzeWithFileMap(REPO_ROOT) as {
      root: import('../../types.js').AnalyzedNode;
      fileMap: Map<string, import('../../types.js').AnalyzedNode>;
    };
    // core/src/index.ts should be a key
    const coreIndexKey = 'packages/core/src/index.ts';
    expect(fileMap.has(coreIndexKey)).toBe(true);
    const node = fileMap.get(coreIndexKey)!;
    expect(node.path).toBe('core/src/index');
    expect(node.type).toBe('module');
  });
});

function collectAll(node: import('../../types.js').AnalyzedNode): import('../../types.js').AnalyzedNode[] {
  const result: import('../../types.js').AnalyzedNode[] = [node];
  for (const child of node.children) result.push(...collectAll(child));
  return result;
}

function collectAllModules(node: import('../../types.js').AnalyzedNode): import('../../types.js').AnalyzedNode[] {
  return collectAll(node).filter((n) => n.type === 'module');
}
