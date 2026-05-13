# types

> Path: `plugin-wiki/src/types`

## Overview
The `plugin-wiki/src/types` module defines TypeScript types and interfaces used throughout the wiki plugin, including node and manifest structures, configuration options, and utility functions. It exports types like `NodeType`, `Manifest`, and `AnyManifest`, along with interfaces for analyzing nodes, generating content, and validating configurations. The module also includes helper functions such as `wikiFilePath` for determining output file paths and `collectNodes` for traversing node trees.

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
