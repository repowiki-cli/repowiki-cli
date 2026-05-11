import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { Analyzer, WikiNode } from '@repowiki/core';
import glob from 'fast-glob';
import ignore from 'ignore';
import type { AnalyzedNode, ExportEntry } from '../../types.js';
import { extractExports } from './queries.js';

const HARD_EXCLUDES = /node_modules|dist\/|__tests__|\.test\.|\.spec\./;

interface PackageInfo {
  dirKey: string;
  name: string;
  shortPath: string;
}

export class TypeScriptAnalyzer implements Analyzer {
  private _lastFileMap = new Map<string, AnalyzedNode>();

  /** Returns raw source file paths relative to repoPath. */
  async discoverFiles(repoPath: string): Promise<string[]> {
    const ig = ignore();
    try {
      const gitignore = await readFile(path.join(repoPath, '.gitignore'), 'utf-8');
      ig.add(gitignore);
    } catch {
      // no .gitignore — fine
    }

    const rawFiles = await glob('**/*.{ts,tsx,js,jsx}', {
      cwd: repoPath,
      followSymbolicLinks: false,
      absolute: false,
    });

    return rawFiles.filter((f) => {
      if (HARD_EXCLUDES.test(f)) return false;
      if (ig.ignores(f)) return false;
      const norm = f.replace(/\\/g, '/');
      if (norm.includes('..')) return false;
      return true;
    });
  }

  async analyze(repoPath: string): Promise<WikiNode[]> {
    const files = await this.discoverFiles(repoPath);

    let projectName = path.basename(repoPath);
    try {
      const pkg = JSON.parse(await readFile(path.join(repoPath, 'package.json'), 'utf-8')) as { name?: string };
      if (pkg.name) projectName = pkg.name;
    } catch { /* ignore */ }

    const root: AnalyzedNode = {
      type: 'project',
      path: projectName,
      title: projectName,
      summary: '',
      exports: [],
      children: [],
    };

    if (files.length === 0) {
      return [root];
    }

    const packages = await this.detectPackages(repoPath, files);

    if (packages.length > 0) {
      for (const pkg of packages) {
        const pkgFiles = files.filter((f) => f.startsWith(pkg.dirKey + '/'));
        const pkgNode: AnalyzedNode = {
          type: 'package',
          path: pkg.shortPath,
          title: pkg.name,
          summary: '',
          exports: [],
          children: [],
        };
        pkgNode.children = await this.buildDirectoryTree(pkg.shortPath, pkg.dirKey, pkgFiles, repoPath);
        root.children.push(pkgNode);
      }
    } else {
      root.children = await this.buildDirectoryTree(projectName, '', files, repoPath);
    }

    return [root];
  }

  /**
   * Like analyze(), but also returns a map from raw file path (relative to repoPath)
   * to the AnalyzedNode for that module. Used by GeneratePipeline to build the manifest.
   */
  async analyzeWithFileMap(repoPath: string): Promise<{ root: AnalyzedNode; fileMap: Map<string, AnalyzedNode> }> {
    this._lastFileMap.clear();
    const result = await this.analyze(repoPath) as AnalyzedNode[];
    return { root: result[0], fileMap: new Map(this._lastFileMap) };
  }

  private async detectPackages(repoPath: string, files: string[]): Promise<PackageInfo[]> {
    const pkgDirSet = new Set<string>();
    for (const f of files) {
      const parts = f.split('/');
      if (parts[0] === 'packages' && parts.length > 2) {
        pkgDirSet.add(`${parts[0]}/${parts[1]}`);
      }
    }

    if (pkgDirSet.size === 0) return [];

    const infos: PackageInfo[] = [];
    for (const dirKey of pkgDirSet) {
      try {
        const pkgJson = JSON.parse(
          await readFile(path.join(repoPath, dirKey, 'package.json'), 'utf-8'),
        ) as { name?: string };
        const rawName = pkgJson.name ?? path.basename(dirKey);
        const shortPath = rawName.includes('/') ? rawName.split('/').pop()! : rawName;
        infos.push({ dirKey, name: rawName, shortPath });
      } catch {
        infos.push({ dirKey, name: path.basename(dirKey), shortPath: path.basename(dirKey) });
      }
    }
    return infos.sort((a, b) => a.dirKey.localeCompare(b.dirKey));
  }

  private async buildDirectoryTree(
    parentPath: string,
    dirKeyPrefix: string,
    files: string[],
    repoPath: string,
  ): Promise<AnalyzedNode[]> {
    const moduleInfos = files.map((f) => {
      const relative = dirKeyPrefix ? f.slice(dirKeyPrefix.length + 1) : f;
      const noExt = relative.replace(/\.(ts|tsx|js|jsx)$/, '');
      const isTsx = /\.(tsx|jsx)$/.test(f);
      const nodePath = `${parentPath}/${noExt}`.replace(/\\/g, '/');
      const title = path.basename(noExt);
      return { rawFile: f, nodePath, title, isTsx };
    });

    return this.groupIntoTree(moduleInfos, parentPath, repoPath);
  }

  private async groupIntoTree(
    modules: { rawFile: string; nodePath: string; title: string; isTsx: boolean }[],
    parentPath: string,
    repoPath: string,
  ): Promise<AnalyzedNode[]> {
    if (modules.length === 0) return [];

    const relative = modules.map((m) => ({
      ...m,
      rel: m.nodePath.slice(parentPath.length + 1),
    }));

    const bySegment = new Map<string, typeof relative>();
    for (const m of relative) {
      const seg = m.rel.split('/')[0];
      if (!bySegment.has(seg)) bySegment.set(seg, []);
      bySegment.get(seg)!.push(m);
    }

    const nodes: AnalyzedNode[] = [];
    for (const [seg, group] of bySegment) {
      if (group.length === 1 && group[0].rel === seg) {
        // Leaf module
        const m = group[0];
        const exports = await this.extractFileExports(path.join(repoPath, m.rawFile), m.isTsx);
        const moduleNode: AnalyzedNode = {
          type: 'module',
          path: m.nodePath,
          title: m.title,
          summary: '',
          exports,
          children: [],
        };
        this._lastFileMap.set(m.rawFile, moduleNode);
        nodes.push(moduleNode);
      } else {
        // Directory grouping with collapse
        const dirPath = `${parentPath}/${seg}`;
        const children = await this.groupIntoTree(group, dirPath, repoPath);

        if (children.length === 1) {
          // Collapse: single child promoted
          nodes.push(children[0]);
        } else {
          nodes.push({
            type: 'directory',
            path: dirPath,
            title: seg,
            summary: '',
            exports: [],
            children,
          });
        }
      }
    }

    return nodes;
  }

  private async extractFileExports(absolutePath: string, isTsx: boolean): Promise<ExportEntry[]> {
    try {
      const source = await readFile(absolutePath, 'utf-8');
      return extractExports(source, isTsx);
    } catch (err) {
      process.stderr.write(`[warn] failed to parse ${absolutePath}: ${String(err)}\n`);
      return [];
    }
  }
}
