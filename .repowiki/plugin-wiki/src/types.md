# types

> Path: `plugin-wiki/src/types`

## Overview
The `plugin-wiki/src/types` module defines a set of TypeScript types and interfaces used throughout the wiki plugin, including node types, manifest structures, and configuration options. It also includes utility functions like `wikiFilePath` for determining output file paths and `collectNodes` for traversing and collecting nodes. These definitions provide the foundation for analyzing and generating wiki content from source nodes.

## Exports
- `type NodeType`
- `interface ExportEntry`
- `interface AnalyzedNode`
- `interface HarnessGenerator`
- `interface ProviderOptions`
- `interface GenerateOptions`
- `interface ValidateOptions`
- `interface Manifest`
- `interface ManifestV2`
- `type AnyManifest`
- `interface UpdateOptions`
- `function wikiFilePath` — Returns the absolute output .md file path for a given AnalyzedNode.
- `function collectNodes` — Collects all nodes of a given type via depth-first traversal.
