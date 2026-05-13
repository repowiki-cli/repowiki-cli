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
                                    monorepo package detection, directory-tree collapse,
                                    loose files (files outside packages/) included via empty-parentPath path
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
  ValidatePipeline.ts             — manifest diff using analyzeWithFileMap() (same discovery as
                                    generate/update); exits 1 when stale/new/deleted files found
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

**Every task that modifies a published package must include a changeset before the work is considered complete.** Create it as part of the same commit or a follow-up commit on the same branch — never leave it to the PR author later.

```bash
yarn changeset
# Select the affected package(s), choose bump type, enter a description
```

Bump type guide:
- `patch` — bug fixes, internal refactors with no behavior change
- `minor` — new features, behavior changes that are backward-compatible
- `major` — breaking changes (API removal, flag rename, output format change)

Manual alternative (non-interactive environments): create `.changeset/<kebab-slug>.md`:

```md
---
"@repowiki/plugin-wiki": minor
---

Description of what changed and why.
```

## Release Workflow

The CI release pipeline (`.github/workflows/release.yml`) splits version management from publishing:

1. **Version PR** — When changesets are present on `main`, `changesets/action@v1` creates or updates a "Version Packages" PR on `changeset-release/main`. Merging this PR bumps all package versions and generates changelogs.

2. **Publish** — After the version PR merges (no pending changesets), the workflow publishes via:
   ```bash
   yarn workspaces foreach --all --no-private npm publish --access public --tolerate-republish
   ```
   `yarn npm publish` is used **intentionally** instead of `changeset publish`. Background: `@changesets/cli@2.x` always delegates to `npm publish` regardless of package manager (issue [#432](https://github.com/changesets/changesets/issues/432), open since 2020). `npm publish` does not resolve Yarn Berry's `workspace:*` protocol and would publish packages with broken dependency specs. `yarn npm publish` resolves `workspace:*` → real version numbers in the packed tarball transparently.

3. **Tagging** — After publish, `yarn changeset tag` creates `pkg@version` git tags; `git push --tags` pushes them.

**Required secret:** `NPM_TOKEN` — used as `YARN_NPM_AUTH_TOKEN` in the publish step.

**`prepack` scripts** in each `package.json` run `yarn build` to ensure compiled artifacts are current before packing. They do **not** check for `workspace:*` refs — that check is a false positive in Yarn Berry because `workspace:*` is correct in source and is resolved by Yarn during pack.

## Extension Points

Implement interfaces from `@repowiki/core` and publish as npm packages:
- Language analyzers: `repowiki-plugin-analyzer-<lang>`
- Output backends: `repowiki-plugin-backend-<name>`
- Install: `repowiki plugins:install <package-name>`


<!-- repowiki:start -->
## RepoWiki — Auto-generated Context

> Generated by `repowiki wiki generate --harness=claude-code`. Do not edit this block manually.

### Project Overview
The project node represents the root of a TypeScript-based repowiki application, containing multiple packages. It includes `repowiki-cli` for command-line operations, `@repowiki/core` as the central module, and several plugin-related packages such as `@repowiki/plugin-context`, `@repowiki/plugin-spec`, and `@repowiki/plugin-wiki` that handle plugin management and functionality. These packages work together to provide a modular and extensible wiki tool.

### Key Modules
| Path | Description |
|------|-------------|
| `core/src/index` | The `core/src/index` module defines foundational interfaces for a repowiki application.  |
| `plugin-context/src/commands/context/index` | The `ContextIndex` class in the `plugin-context/src/commands/context/index` module is responsible for managing and organizing contextual data within the plugin system.  |
| `plugin-context/src/commands/context/query` | **ContextQuery** is a TypeScript class located in the `plugin-context/src/commands/context/query` module.  |
| `plugin-context/src/commands/context/serve` | The `ContextServe` class in the `plugin-context/src/commands/context/serve` module is responsible for initiating a local development server for the plugin context.  |
| `plugin-context/src/index` | The `plugin-context/src/index` module serves as the entry point for the plugin context functionality within the application.  |
| `plugin-spec/src/commands/spec/atdd` | The `SpecAtdd` class in the `plugin-spec/src/commands/spec/atdd` module is responsible for handling ATDD (Acceptance Test-Driven Development) related commands within the plugin specification system.  |
| `plugin-spec/src/commands/spec/review` | The `SpecReview` class in the `plugin-spec/src/commands/spec/review` module is responsible for handling review-related functionality within the plugin specification system.  |
| `plugin-spec/src/commands/spec/sdd` | The `SpecSdd` class in the `plugin-spec/src/commands/spec/sdd` module is responsible for handling commands related to the SDD (Software Development Document) within the plugin specification system.  |
| `plugin-spec/src/index` | The `plugin-spec/src/index` module serves as the entry point for plugin-related definitions and configurations.  |
| `plugin-wiki/src/analyzers/typescript/queries` | The `extractExports` function is part of the TypeScript analyzer module located in `plugin-wiki/src/analyzers/typescript/queries`.  |
| `plugin-wiki/src/analyzers/typescript/TypeScriptAnalyzer` | The `TypeScriptAnalyzer` class is a module within the `plugin-wiki` project responsible for analyzing TypeScript code.  |
| `plugin-wiki/src/backends/LocalMarkdownBackend` | The `LocalMarkdownBackend` class in the `plugin-wiki/src/backends/LocalMarkdownBackend` module is responsible for handling local Markdown file operations within the wiki plugin.  |
| `plugin-wiki/src/backends/ManifestManager` | The `ManifestManager` class in the `plugin-wiki/src/backends/ManifestManager` module is responsible for managing application manifests.  |
| `plugin-wiki/src/commands/wiki/generate` | The `WikiGenerate` class in the `plugin-wiki/src/commands/wiki/generate` module is responsible for generating wiki content based on provided input.  |
| `plugin-wiki/src/commands/wiki/update` | The `WikiUpdate` class in the `plugin-wiki/src/commands/wiki/update` module is responsible for handling the update functionality of wiki pages within the application.  |
| `plugin-wiki/src/commands/wiki/validate` | **Module Summary:**  
The `wiki-validate` module contains the `WikiValidate` class, which is responsible for validating wiki-related data or structures within the application.  |
| `plugin-wiki/src/harness/ClaudeCodeHarness` | The `ClaudeCodeHarness` class in the `plugin-wiki/src/harness/ClaudeCodeHarness` module serves as a wrapper for interacting with the Claude code generation API.  |
| `plugin-wiki/src/harness/CursorHarness` | The `CursorHarness` class in the `plugin-wiki/src/harness/CursorHarness` module provides a utility for managing cursor states within a plugin environment.  |
| `plugin-wiki/src/harness/HarnessWriter` | The `writeHarnessBlock` function in the `HarnessWriter` module is responsible for generating and writing a harness block, which is typically used in testing or execution environments.  |
| `plugin-wiki/src/index` | The `plugin-wiki/src/index` module serves as the entry point for the wiki plugin functionality within the application.  |
| `plugin-wiki/src/pipeline/GeneratePipeline` | The `GeneratePipeline` class in the `plugin-wiki/src/pipeline/GeneratePipeline` module is responsible for orchestrating the generation process within the wiki plugin.  |
| `plugin-wiki/src/pipeline/render` | The `render` module in the `plugin-wiki` package contains functions for processing and rendering markdown content.  |
| `plugin-wiki/src/pipeline/summarize` | The `summarize` module in the `plugin-wiki` package provides utilities for generating summaries of code modules and handling potential errors during the summarization process.  |
| `plugin-wiki/src/pipeline/UpdatePipeline` | The `UpdatePipeline` class in the `plugin-wiki/src/pipeline/UpdatePipeline` module is responsible for managing the process of updating data within a pipeline.  |
| `plugin-wiki/src/pipeline/ValidatePipeline` | The `ValidatePipeline` class in the `plugin-wiki/src/pipeline/ValidatePipeline` module is responsible for validating the structure and content of a pipeline configuration.  |
| `plugin-wiki/src/progress` | The `progress` module in the `plugin-wiki` package provides types and utilities for tracking and reporting progress within an application.  |
| `plugin-wiki/src/providers/AnthropicProvider` | The `AnthropicProvider` class in the `plugin-wiki/src/providers/AnthropicProvider` module serves as an interface for interacting with Anthropic's AI services.  |
| `plugin-wiki/src/providers/AzureOpenAIProvider` | The `AzureOpenAIProvider` class in the `plugin-wiki/src/providers/AzureOpenAIProvider` module is responsible for integrating with Azure OpenAI services.  |
| `plugin-wiki/src/providers/createProvider` | The `createProvider` module provides functions for creating and managing providers within the application.  |
| `plugin-wiki/src/providers/OpenAIProvider` | The `OpenAIProvider` class in the `plugin-wiki/src/providers/OpenAIProvider` module serves as a bridge to interact with OpenAI's API.  |
| `plugin-wiki/src/types` | **plugin-wiki/src/types**  
This TypeScript module defines types and interfaces used for processing and generating wiki content from a codebase.  |
| `repowiki-cli/bin/run` | The `repowiki-cli/bin/run` module is the entry point for executing the repowiki CLI tool.  |
| `repowiki-cli/src/index` | The `repowiki-cli/src/index` module exports a single constant, `VERSION`, which represents the current version of the CLI tool.  |
<!-- repowiki:end -->
