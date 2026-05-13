# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
yarn install

# Build all packages (tsc, no bundler)
yarn build

# Run all tests
yarn test

# Run tests for a single package
yarn workspace @repowiki/plugin-wiki test

# Run a specific test file
yarn workspace @repowiki/plugin-wiki vitest run src/providers/__tests__/providers.test.ts

# Type-check without emitting
yarn typecheck

# Lint (Biome)
yarn lint

# Auto-fix lint issues
yarn lint --write

# Run the CLI locally (after build)
node packages/cli/bin/run.js wiki:generate --provider=dashscope --harness=claude-code
node packages/cli/bin/run.js wiki:validate
node packages/cli/bin/run.js wiki:generate --provider=dashscope --dry-run
```

## Environment Variables

| Variable | Provider |
|---|---|
| `ANTHROPIC_API_KEY` | `--provider=anthropic` |
| `OPENAI_API_KEY` | `--provider=openai`, `--provider=openai-compat:URL` |
| `AZURE_OPENAI_API_KEY` | `--provider=azure` |
| `AZURE_OPENAI_ENDPOINT` | `--provider=azure` (e.g. `https://YOUR-RESOURCE.openai.azure.com`) |
| `DASHSCOPE_API_KEY` | `--provider=dashscope` |
| `DEEPSEEK_API_KEY` | `--provider=deepseek` |

Both commands load `.env` from the current working directory automatically. Explicit env vars take precedence.

## Architecture

Yarn 4 workspaces monorepo. Five packages map to the three-layer methodology:

```
packages/core            — shared TypeScript interfaces only (zero runtime deps)
packages/cli             — oclif CLI entry point; aggregates the three plugins
packages/plugin-wiki     — Layer 1: wiki:generate / wiki:validate / wiki:update
packages/plugin-context  — Layer 2: context:index / context:query / context:serve (stub)
packages/plugin-spec     — Layer 3: spec:sdd / spec:atdd / spec:review (stub)
```

**Dependency rule:** `cli` → all three plugins → `@repowiki/core`. Plugins never depend on each other. `@repowiki/core` has zero runtime dependencies.

**`@repowiki/core` contracts** (`packages/core/src/index.ts`):
- `Analyzer` — `analyze(repoPath): Promise<WikiNode[]>`
- `LLMProvider` — `complete(messages: ChatMessage[]): Promise<string>`
- `OutputBackend` — `write / read / query`
- `WikiNode` — `{ path, title, summary, children }`

All concrete implementations live in `plugin-wiki`; `core` only exports interfaces.

## plugin-wiki Internal Structure

The only fully implemented plugin. Its `src/` layout:

```
types.ts                          — AnalyzedNode (extends WikiNode + type + exports),
                                    GenerateOptions, ValidateOptions, Manifest,
                                    wikiFilePath(), collectNodes()
analyzers/typescript/
  TypeScriptAnalyzer.ts           — implements Analyzer; file discovery (fast-glob + ignore),
                                    monorepo package detection, directory-tree collapse
  queries.ts                      — Tree-sitter AST traversal for export extraction
providers/
  OpenAIProvider.ts               — openai SDK (also used for Ollama/DashScope/DeepSeek)
  AnthropicProvider.ts            — @anthropic-ai/sdk
  AzureOpenAIProvider.ts          — openai AzureOpenAI class; reads AZURE_OPENAI_ENDPOINT
  createProvider.ts               — factory + providerEnvKey()
backends/
  LocalMarkdownBackend.ts         — implements OutputBackend; path-traversal guard
  ManifestManager.ts              — .repowiki/.manifest.json atomic read/write, SHA-256 hashing
harness/
  HarnessWriter.ts                — non-destructive tagged-block writes to CLAUDE.md / .cursorrules
  ClaudeCodeHarness.ts / CursorHarness.ts — implement HarnessGenerator
pipeline/
  GeneratePipeline.ts             — analyze → summarize (concurrent batches) → render → write
  ValidatePipeline.ts             — manifest diff; exits 1 when stale/new/deleted files found
commands/wiki/
  generate.ts / validate.ts       — thin oclif wrappers; load .env, validate flags, call pipelines
```

**GeneratePipeline flow:** `analyzeWithFileMap()` → token estimate (optional) → concurrent LLM summarization of module nodes (Map-collect-then-apply to avoid race conditions) → bottom-up parent node summarization → Markdown render → write files → save manifest → harness config.

**Node types:** `project` (root) → `package` (monorepo workspace) → `directory` (intermediate, collapsed when single-child) → `module` (source file). Path mapping: project→`_index.md`, package/directory→`{path}/_index.md`, module→`{path}.md`.

## Build and Module Resolution

- **`module: NodeNext`** — all relative imports in `.ts` source files must use `.js` extensions (e.g. `import { Foo } from './foo.js'`).
- `tsconfig.json` per package extends `../../tsconfig.base.json` and excludes `src/**/__tests__/**` from compilation.
- **tree-sitter** uses native N-API bindings. CI needs `python3`, `make`, and `gcc`/`clang` available.

## Test Conventions

Tests live in `__tests__/` next to their source:

```
src/providers/OpenAIProvider.ts
src/providers/__tests__/providers.test.ts
```

Framework: Vitest. All LLM calls are mocked (`vi.mock('openai', ...)`); no network calls in tests.

## Changesets

Every PR that changes a published package requires a changeset:

```bash
yarn changeset
```

## Extension Points

Implement interfaces from `@repowiki/core` and publish as npm packages:
- Language analyzers: `repowiki-plugin-analyzer-<lang>`
- Output backends: `repowiki-plugin-backend-<name>`
- Install: `repowiki plugins:install <package-name>`


<!-- repowiki:start -->
## RepoWiki — Auto-generated Context

> Generated by `repowiki wiki generate --harness=claude-code`. Do not edit this block manually.

### Project Overview
The project node represents the core structure of a TypeScript-based Repowiki system. It includes the `repowiki-cli` for command-line interactions, `@repowiki/core` as the foundational module, `@repowiki/plugin-context` for managing plugin context, `@repowiki/plugin-spec` for node-specific functionality, and `@repowiki/plugin-wiki` for core wiki operations. Together, these packages form a modular architecture that supports both CLI and plugin-based wiki management.

### Key Modules
| Path | Description |
|------|-------------|
| `core/src/index` | The `core/src/index` module defines the core interfaces and configurations used throughout the application.  |
| `plugin-context/src/commands/context/index` | The `ContextIndex` class in the `plugin-context/src/commands/context/index` module is responsible for managing and organizing contextual data within the plugin system.  |
| `plugin-context/src/commands/context/query` | **Module:** `plugin-context/src/commands/context/query`  
**Exports:** `ContextQuery`  
This TypeScript module defines the `ContextQuery` class, which is used to execute queries against a context system within a plugin-based application.  |
| `plugin-context/src/commands/context/serve` | The `ContextServe` class in the `plugin-context/src/commands/context/serve` module is responsible for managing the local development server functionality within the plugin context.  |
| `plugin-context/src/index` | The `plugin-context/src/index` module serves as the entry point for the plugin context functionality within the application.  |
| `plugin-spec/src/commands/spec/atdd` | The `SpecAtdd` class in the `plugin-spec/src/commands/spec/atdd` module is responsible for handling ATDD (Acceptance Test-Driven Development) related commands within the plugin specification system.  |
| `plugin-spec/src/commands/spec/review` | The `SpecReview` class in the `plugin-spec/src/commands/spec/review` module is responsible for handling review operations related to specification documents.  |
| `plugin-spec/src/commands/spec/sdd` | The `SpecSdd` class is part of the `plugin-spec` module and resides in the `commands/spec/sdd` directory.  |
| `plugin-spec/src/index` | The `plugin-spec/src/index` module serves as the entry point for plugin specifications within the codebase.  |
| `plugin-wiki/src/analyzers/typescript/queries` | The `extractExports` function is part of the TypeScript analyzer module located in `plugin-wiki/src/analyzers/typescript/queries`.  |
| `plugin-wiki/src/analyzers/typescript/TypeScriptAnalyzer` | The `TypeScriptAnalyzer` class is a module within the `plugin-wiki` project designed to analyze TypeScript code.  |
| `plugin-wiki/src/backends/LocalMarkdownBackend` | The `LocalMarkdownBackend` class in the `plugin-wiki/src/backends/LocalMarkdownBackend` module is responsible for handling local Markdown file operations within the wiki plugin.  |
| `plugin-wiki/src/backends/ManifestManager` | **ManifestManager** is a TypeScript class responsible for managing and processing manifest files within the plugin-wiki module.  |
| `plugin-wiki/src/commands/wiki/generate` | The `WikiGenerate` class in the `plugin-wiki/src/commands/wiki/generate` module is responsible for generating wiki content based on provided input.  |
| `plugin-wiki/src/commands/wiki/update` | The `WikiUpdate` class in the `plugin-wiki/src/commands/wiki/update` module is responsible for handling the update functionality within the wiki plugin.  |
| `plugin-wiki/src/commands/wiki/validate` | **Module Summary:**  
The `wiki-validate` module contains the `WikiValidate` class, which is responsible for validating wiki-related data or structures within the application.  |
| `plugin-wiki/src/harness/ClaudeCodeHarness` | The `ClaudeCodeHarness` class in the `plugin-wiki/src/harness/ClaudeCodeHarness` module provides a specialized execution environment for running code within the context of the Claude AI model.  |
| `plugin-wiki/src/harness/CursorHarness` | The `CursorHarness` class in the `plugin-wiki/src/harness/CursorHarness` module provides utilities for managing and interacting with a cursor within a text-based interface.  |
| `plugin-wiki/src/harness/HarnessWriter` | The `writeHarnessBlock` function in the `HarnessWriter` module is responsible for generating and writing a harness block to a specified output location.  |
| `plugin-wiki/src/index` | The `plugin-wiki/src/index` module serves as the entry point for the wiki plugin functionality within the application.  |
| `plugin-wiki/src/pipeline/GeneratePipeline` | The `GeneratePipeline` class in the `plugin-wiki/src/pipeline/GeneratePipeline` module is responsible for orchestrating the generation process within the wiki plugin.  |
| `plugin-wiki/src/pipeline/render` | The `render` module in `plugin-wiki/src/pipeline/render` provides functions for processing and rendering wiki content.  |
| `plugin-wiki/src/pipeline/summarize` | The `summarize` module in the `plugin-wiki` package provides utilities for generating summaries of code modules and handling potential errors during the summarization process.  |
| `plugin-wiki/src/pipeline/UpdatePipeline` | The `UpdatePipeline` class in the `plugin-wiki/src/pipeline/UpdatePipeline` module is responsible for managing the workflow of updating data or content within the application.  |
| `plugin-wiki/src/pipeline/ValidatePipeline` | The `ValidatePipeline` class in the `plugin-wiki/src/pipeline/ValidatePipeline` module is responsible for validating the structure and content of a pipeline configuration.  |
| `plugin-wiki/src/progress` | The `progress` module in the `plugin-wiki` package provides types and utilities for tracking and reporting progress within an application.  |
| `plugin-wiki/src/providers/AnthropicProvider` | The `AnthropicProvider` class in the `plugin-wiki/src/providers/AnthropicProvider` module serves as a bridge for integrating with Anthropic's AI services.  |
| `plugin-wiki/src/providers/AzureOpenAIProvider` | The `AzureOpenAIProvider` class in the `plugin-wiki/src/providers/AzureOpenAIProvider` module is responsible for integrating with Azure OpenAI services.  |
| `plugin-wiki/src/providers/createProvider` | The `createProvider` module exports a function used to create a provider instance.  |
| `plugin-wiki/src/providers/OpenAIProvider` | The `OpenAIProvider` class in the `plugin-wiki/src/providers/OpenAIProvider` module serves as a wrapper for interacting with OpenAI's API.  |
| `plugin-wiki/src/types` | The `plugin-wiki/src/types` module defines TypeScript types and interfaces used throughout the wiki plugin, including node and manifest structures, configuration options, and utility functions.  |
| `repowiki-cli/bin/run` | The `repowiki-cli/bin/run` module is the entry point for executing the repowiki CLI tool.  |
| `repowiki-cli/src/index` | The `repowiki-cli/src/index` module exports a single constant `VERSION`, which represents the current version of the CLI tool.  |
<!-- repowiki:end -->
