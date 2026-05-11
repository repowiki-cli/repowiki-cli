# types

> Path: `plugin-wiki/src/types`

## Overview
This TypeScript module defines type and interface declarations used for processing and generating wiki content from a node-based structure. It includes types like `NodeType`, `AnalyzedNode`, and `Manifest`, as well as interfaces for generators, options, and validation. The module also provides utility functions such as `wikiFilePath` to determine output file paths and `collectNodes` to traverse and collect nodes of a specific type.

## Exports
- `type NodeType`
- `interface ExportEntry`
- `interface AnalyzedNode`
- `interface HarnessGenerator`
- `interface ProviderOptions`
- `interface GenerateOptions`
- `interface ValidateOptions`
- `interface Manifest`
- `function wikiFilePath` — Returns the absolute output .md file path for a given AnalyzedNode.
- `function collectNodes` — Collects all nodes of a given type via depth-first traversal.
