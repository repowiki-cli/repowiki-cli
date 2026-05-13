import Parser from 'tree-sitter';
import type { ExportEntry } from '../../types.js';

// Use any for SyntaxNode to avoid complex type extraction
// biome-ignore lint/suspicious/noExplicitAny: tree-sitter types not exported
type SyntaxNode = any;

// Load tree-sitter-typescript via CJS require (package ships no ESM)
const { typescript: TSLanguage, tsx: TSXLanguage } = (() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('tree-sitter-typescript') as {
    typescript: unknown;
    tsx: unknown;
  };
})();

const tsParser = new Parser();
// biome-ignore lint/suspicious/noExplicitAny: tree-sitter types not exported
tsParser.setLanguage(TSLanguage as any);

const tsxParser = new Parser();
// biome-ignore lint/suspicious/noExplicitAny: tree-sitter types not exported
tsxParser.setLanguage(TSXLanguage as any);

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
  if (prev?.type !== 'comment') return undefined;
  const text = prev.text;
  if (!text.startsWith('/**')) return undefined;
  // Strip the /** prefix and */ suffix, then extract the first meaningful line
  const inner = text.replace(/^\/\*\*/, '').replace(/\*\/$/, '');
  for (const line of inner.split('\n')) {
    const trimmed = line.replace(/^\s*\*?\s?/, '').trim();
    if (trimmed && !trimmed.startsWith('@')) {
      return trimmed;
    }
  }
  return undefined;
}

export function extractExports(source: string, isTsx: boolean): ExportEntry[] {
  const tree = (isTsx ? tsxParser : tsParser).parse(source);
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
