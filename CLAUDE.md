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
node packages/cli/bin/run.js wiki:generate --provider=dashscope --dry-run
node packages/cli/bin/run.js wiki:update --provider=dashscope
node packages/cli/bin/run.js wiki:validate
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
  generate.ts / validate.ts / update.ts — thin oclif wrappers; load .env, validate flags, call pipelines
```

**GeneratePipeline flow:** `analyzeWithFileMap()` → token estimate (optional) → concurrent LLM summarization of module nodes (Map-collect-then-apply to avoid race conditions) → bottom-up parent node summarization → Markdown render → write files → save manifest → harness config.

**UpdatePipeline flow:** reads the v2 manifest (which stores per-file SHA-256 hashes and summaries) → re-runs `analyzeWithFileMap()` → diffs against manifest to find changed/new/deleted files → re-summarizes only the changed module nodes → propagates updated summaries up to parent nodes → re-renders and writes only affected wiki files → saves updated manifest. Does not touch the harness.

**Node types:** `project` (root) → `package` (monorepo workspace) → `directory` (intermediate, collapsed when single-child) → `module` (source file). Path mapping: project→`_index.md`, package/directory→`{path}/_index.md`, module→`{path}.md`.

## Build and Module Resolution

- **`module: NodeNext`** — all relative imports in `.ts` source files must use `.js` extensions (e.g. `import { Foo } from './foo.js'`).
- `tsconfig.json` per package extends `../../tsconfig.base.json` and excludes `src/**/__tests__/**` from compilation.
- **tree-sitter** uses native N-API bindings. CI needs `python3`, `make`, and `gcc`/`clang` available. On Node.js 24, pre-built binaries may be absent — rebuild from source with `CXXFLAGS="-std=c++20" npm rebuild tree-sitter`.

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
The project node in the TypeScript codebase includes several key packages: `repowiki-cli` provides the command-line interface, `@repowiki/core` serves as the foundational module, `@repowiki/plugin-context` manages plugin contexts, `@repowiki/plugin-spec` defines plugin specifications, and `@repowiki/plugin-wiki` is the core module for the wiki plugin. Each package contributes to the overall functionality and extensibility of the repowiki tool. Together, they form a modular architecture for managing wiki-based documentation and plugin systems.

### Architecture
`core`                                   — The `node` package in the TypeScript project serves as a foundational module, containing the `core/src/index` module.
`plugin-context`                         — The `plugin-context` package in the TypeScript project provides core functionality for managing plugin contexts.
`plugin-context/src`                     — The `plugin-context` directory in the TypeScript project provides the core functionality for managing plugin contexts.
`plugin-context/src/commands/context`    — The `context` directory in the TypeScript project contains classes that manage different aspects of the plugin context.
`plugin-spec`                            — **Package Node Summary:**  
This package node contains the `src/plugin-spec` directory, which serves as the core module for defining and managing plugin specifications in the TypeScript project.
`plugin-spec/src`                        — The `plugin-spec` directory serves as the core module for plugin specifications in the TypeScript project.
`plugin-spec/src/commands/spec`          — The directory contains the core command handlers for the specification plugin, including ATDD, review, and SDD functionalities.
`plugin-wiki`                            — The `plugin-wiki` package is the core module of the wiki plugin in a TypeScript project.
`plugin-wiki/src`                        — The `plugin-wiki` directory is the core of the wiki plugin in a TypeScript project, containing modules for functionality, progress tracking, types, backend utilities, harness execution, AI providers, content pipelines, and core wiki commands.
`plugin-wiki/src/analyzers/typescript`   — The directory is part of the `plugin-wiki` package and contains tools for analyzing TypeScript code.
`plugin-wiki/src/backends`               — This directory contains backend utilities for the wiki plugin, including local Markdown file handling and manifest management.
`plugin-wiki/src/commands/wiki`          — This directory contains the core command modules for wiki functionality in a TypeScript project.
`plugin-wiki/src/harness`                — The directory contains harness-related modules used for executing code in specific environments and managing text interfaces.
`plugin-wiki/src/pipeline`               — The `pipeline` directory in the `plugin-wiki` TypeScript project contains classes and modules responsible for managing different stages of content processing.
`plugin-wiki/src/providers`              — This directory contains provider classes and utilities for integrating with various AI services.
`repowiki-cli`                           — The `repowiki-cli` package serves as the command-line interface (CLI) for the repowiki tool.

> For per-file summaries, see `.repowiki/`.
<!-- repowiki:end -->
