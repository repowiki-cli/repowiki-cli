# types

> Path: `plugin-wiki/src/types`

## Overview
**plugin-wiki/src/types**  
This TypeScript module defines types and interfaces used for processing and generating wiki content from a codebase. It includes node types, manifest structures, and options interfaces for analysis and generation. It also provides utility functions like `wikiFilePath` and `collectNodes` for navigating and organizing documentation nodes.

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
