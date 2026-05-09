# Contributing to repowiki-cli

Thank you for your interest in contributing!

## Development Setup

**Prerequisites:** Node.js 20+, Yarn 4+

```bash
git clone https://github.com/your-org/repowiki-cli.git
cd repowiki-cli
yarn install
yarn build
yarn test
```

Verify the CLI runs:
```bash
node packages/cli/bin/run.js --help
```

## Making Changes

1. Fork the repo and create a branch from `main`
2. Make your changes with tests
3. Run `yarn lint && yarn build && yarn test`
4. Add a changeset: `yarn changeset` (select affected packages, describe the change)
5. Open a pull request using the PR template

## Contributor Paths

### Bug fix / Feature

Standard fork → branch → PR. Every PR that changes published packages requires a changeset.

### Language Analyzer

Implement the `Analyzer` interface from `@repowiki/core`:

```typescript
import type { Analyzer, WikiNode } from '@repowiki/core'

export class RustAnalyzer implements Analyzer {
  async analyze(repoPath: string): Promise<WikiNode[]> {
    // Parse repo using Tree-sitter, return wiki hierarchy
    // WikiNode.path    = logical path ("src/auth")
    // WikiNode.title   = human-readable name
    // WikiNode.summary = AI-generated summary (call your LLM here)
    // WikiNode.children = nested nodes
  }
}
```

> **Note:** The TypeScript reference implementation in `packages/plugin-wiki` is available from Phase 1B onward.

Publish as `repowiki-plugin-analyzer-<lang>` and install with:
```bash
repowiki plugins:install repowiki-plugin-analyzer-rust
```

### Output Backend

Implement the `OutputBackend` interface from `@repowiki/core`:

```typescript
import type { OutputBackend, WikiNode } from '@repowiki/core'

export class QdrantBackend implements OutputBackend {
  async write(path: string, content: string): Promise<void> { ... }
  async read(path: string): Promise<string> { ... }
  async query(embedding: number[]): Promise<WikiNode[]> { ... }
}
```

> The full backend interface spec (embedding format, query contract) is published alongside Phase 1B.

Publish as `repowiki-plugin-backend-<name>`.

## Code Style

```bash
yarn lint          # check
yarn lint --write  # auto-fix (Biome)
```

## Commit Convention

[Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
