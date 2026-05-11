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
yarn workspace @repowiki/core test
yarn workspace repowiki-cli test

# Type-check without emitting
yarn typecheck

# Lint (Biome)
yarn lint

# Auto-fix lint issues
yarn lint --write

# Run the CLI locally (after build)
node packages/cli/bin/run.js --help
```

## Architecture

This is a Yarn 4 workspaces monorepo. The five packages map to the three-layer methodology:

```
packages/core            — shared TypeScript interfaces only (no runtime code)
packages/cli             — oclif CLI entry point; registers the three plugins
packages/plugin-wiki     — Layer 1: wiki generate/update/validate commands
packages/plugin-context  — Layer 2: context index/query/serve commands
packages/plugin-spec     — Layer 3: spec sdd/atdd/review commands
```

**Dependency flow:** `cli` depends on all three plugins; each plugin depends on `@repowiki/core`; plugins never depend on each other. At runtime however the layers are a sequential pipeline — Layer 1 writes `WikiNode` Markdown to `.repowiki/` in the target repo, Layer 2 indexes that output and serves RAG queries, Layer 3 consumes those queries to generate specs. Layers 2 and 3 require Layer 1 to have run first.

**`@repowiki/core` is the contract layer.** It exports four interfaces that everything else implements:
- `Analyzer` — parses a repo into `WikiNode[]` (tree-sitter based, TS/JS built-in)
- `LLMProvider` — wraps any LLM behind a single `complete(messages)` call
- `OutputBackend` — read/write/query interface for wiki storage
- `WikiNode` — the unit of the wiki hierarchy (`path`, `title`, `summary`, `children`)

**CLI framework:** oclif v4. Commands live at `src/commands/<topic>/<verb>.ts` inside each plugin. The plugin's `oclif.commands` field in `package.json` points to `./dist/commands`.

**Build:** Each package builds independently with `tsc -p tsconfig.json`. `tsconfig.json` extends `../../tsconfig.base.json` and excludes `src/**/__tests__/**` from compilation output.

**Default wiki output:** `.repowiki/` directory written into the target repo (not this repo).

**Status:** Pre-v0.1 design phase — all command `run()` bodies currently log `'not yet implemented'`. See `docs/architecture.md` for the full interface specs.

## Test Conventions

Tests live in a `__tests__/` directory next to their source file (not a top-level `tests/` dir):

```
src/commands/wiki/generate.ts
src/commands/wiki/__tests__/generate.test.ts
```

Test framework is Vitest. Import style: `import { describe, expect, it } from 'vitest'`.

## Changesets

Every PR that changes a published package requires a changeset entry:

```bash
yarn changeset   # select affected packages, describe the change
```

## Extension Points

New language analyzers and output backends implement interfaces from `@repowiki/core`:
- Analyzers: publish as `repowiki-plugin-analyzer-<lang>`
- Backends: publish as `repowiki-plugin-backend-<name>`
- Install via: `repowiki plugins:install <package-name>`
