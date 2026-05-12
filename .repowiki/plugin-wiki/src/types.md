# types

> Path: `plugin-wiki/src/types`

## Overview
This TypeScript module defines type and interface definitions used throughout the wiki plugin, including node types, manifest structures, and options for generating and validating content. It also includes utility functions like `wikiFilePath` for determining output file paths and `collectNodes` for traversing nodes in a tree. These types and functions support the analysis, generation, and management of wiki content within the plugin's workflow.

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
