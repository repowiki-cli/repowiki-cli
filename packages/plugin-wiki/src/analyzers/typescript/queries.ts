import Parser from 'tree-sitter';
import type { ExportEntry } from '../../types.js';

// Use any for SyntaxNode to avoid complex type extraction
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SyntaxNode = any;

// Load tree-sitter-typescript via CJS require (package ships no ESM)
const { typescript: TSLanguage, tsx: TSXLanguage } = (() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('tree-sitter-typescript') as {
    typescript: unknown;
    tsx: unknown;
  };
})();

function kindFromNodeType(type: string): ExportEntry['kind'] | null {
  switch (type) {
    case 'class_declaration':
    case 'abstract_class_declaration':
      return 'class';
    case 'interface_declaration':
      return 'interface';
    case 'type_alias_declaration':
      return 'type';
    case 'function_declaration':
      return 'function';
    case 'lexical_declaration':
    case 'variable_declaration':
      return 'const';
    default:
      return null;
  }
}

function getExportName(decl: SyntaxNode): string | null {
  if (decl.type === 'lexical_declaration' || decl.type === 'variable_declaration') {
    for (let i = 0; i < decl.childCount; i++) {
      const child = decl.child(i);
      if (child?.type === 'variable_declarator') {
        const nameNode = child.childForFieldName('name');
        return nameNode?.text ?? null;
      }
    }
    return null;
  }
  const nameNode = decl.childForFieldName('name');
  return nameNode?.text ?? null;
}

function getLeadingJsDoc(node: SyntaxNode): string | undefined {
  const prev = node.previousNamedSibling;
  if (prev?.type === 'comment' && prev.text.startsWith('/**')) {
    const lines = prev.text.split('\n') as string[];
    for (const line of lines) {
      const trimmed = line.replace(/^\s*\*+\s?/, '').trim();
      if (trimmed && trimmed !== '/' && !trimmed.startsWith('@')) {
        return trimmed;
      }
    }
  }
  return undefined;
}

export function extractExports(source: string, isTsx: boolean): ExportEntry[] {
  const parser = new Parser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parser.setLanguage((isTsx ? TSXLanguage : TSLanguage) as any);
  const tree = parser.parse(source);
  const exports: ExportEntry[] = [];

  function visit(node: SyntaxNode): void {
    if (node.type === 'export_statement') {
      const decl = node.childForFieldName('declaration');
      if (decl) {
        const kind = kindFromNodeType(decl.type as string);
        const name = getExportName(decl);
        if (kind && name) {
          exports.push({ kind, name, jsDoc: getLeadingJsDoc(node) });
        }
      }
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) visit(child);
    }
  }

  visit(tree.rootNode);
  return exports;
}
