# Phase 1A Infrastructure Design

**Date:** 2026-05-09  
**Scope:** Project scaffolding, monorepo setup, CI/CD, and documentation — no CLI business logic  
**Next phase:** Phase 1B — `plugin-wiki` core implementation

---

## Glossary

**AI harness** — any tool that manages AI context and coding sessions during development (Claude Code, Cursor, Windsurf, Opencode, GitHub Copilot, etc.). `repowiki-cli` generates harness-specific config files (e.g. `CLAUDE.md`, `.cursorrules`) so each harness loads the right wiki context automatically.

**plugin** — an Oclif plugin package that adds commands to the CLI. `@repowiki/plugin-wiki` is a plugin. Community-built analyzers and backends are also distributed as Oclif plugins and installed via `repowiki plugins:install <pkg>`. `plugins:install` is an Oclif built-in command — it does not need to be scaffolded.

---

## Overview

Phase 1A establishes the project foundation for `repowiki-cli`: a community-maintainable, open-source CLI tool. The goal is to produce a repository that contributors can clone, build, test, and extend immediately — before any wiki-generation logic exists.

Deliverables:
1. Monorepo structure with Yarn Berry workspaces
2. Five packages scaffolded (`cli`, `core`, `plugin-wiki`, `plugin-context`, `plugin-spec`)
3. Three GitHub Actions workflows (`ci`, `release`, `repowiki` dogfood)
4. GitHub community files (issue templates, PR template, Code of Conduct)
5. `CONTRIBUTING.md` with contributor onboarding paths
6. `docs/` structure with architecture overview
7. README quick start and installation sections

---

## Tech Stack

| Concern | Choice | Reason |
|---|---|---|
| Language | TypeScript (strict mode) | Type-safe, aligns with TS/JS analyzer target |
| Runtime | Node.js 20 LTS (minimum) | LTS stability, native ESM support |
| CLI framework | Oclif | Native plugin architecture for community extensions |
| Package manager | Yarn Berry (v4) | Workspace support, node-modules linker for Oclif compat |
| Linting + formatting | Biome | Single config, 10–100× faster than ESLint + Prettier |
| Testing | Vitest | Native TS, fast, compatible with tsup build chain |
| Building | tsup | Dual ESM + CJS output; each package outputs CJS as primary target for Oclif compat |
| Versioning | Changesets | Per-package versioning, auto CHANGELOG, PR-level discipline |

---

## Repository Structure

```
repowiki-cli/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml
│   │   ├── release.yml
│   │   └── repowiki.yml
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.yml
│   │   └── feature_request.yml
│   └── PULL_REQUEST_TEMPLATE.md
├── packages/
│   ├── cli/                 # Oclif root CLI, aggregates plugins, npm publish target
│   ├── core/                # Shared interfaces: LLM Provider, Backend, Analyzer
│   ├── plugin-wiki/         # Layer 1 — wiki generate/update/validate (Phase 1B)
│   ├── plugin-context/      # Layer 2 — index/query/serve (Phase 1C, placeholder)
│   └── plugin-spec/         # Layer 3 — sdd/atdd/review (Phase 1D, placeholder)
├── .yarnrc.yml              # nodeLinker: node-modules
├── .changeset/
│   └── config.json          # access: public, changelog: @changesets/changelog-github
├── package.json             # workspace root (private: true)
├── tsconfig.base.json       # strict, target ES2022, moduleResolution NodeNext, declaration true
├── biome.json               # lint + format rules
├── CODE_OF_CONDUCT.md       # Contributor Covenant v2.1
├── CONTRIBUTING.md
├── README.md
└── README.zh.md
```

Each package under `packages/` has its own `package.json`, `tsconfig.json` (extends base), and `src/` + `__tests__/` directories following the co-location convention.

---

## npm Scope & Prerequisites

All packages use the `@repowiki/` npm scope for internal imports:
- `packages/cli` → `package.json` `name`: **`repowiki-cli`** (unscoped — this is what users `npm install -g repowiki-cli`)
- `packages/core` → `@repowiki/core`
- `packages/plugin-wiki` → `@repowiki/plugin-wiki`
- `packages/plugin-context` → `@repowiki/plugin-context`
- `packages/plugin-spec` → `@repowiki/plugin-spec`

The `cli` package uses an unscoped name so users install with `npm install -g repowiki-cli`. Internal cross-package imports use the scoped names (e.g., `import type { Analyzer } from '@repowiki/core'`).

**Pre-publish prerequisites (required before `release.yml` can succeed):**
1. Create npm org `@repowiki` with public package access
2. Generate npm token with `publish` scope → add as `NPM_TOKEN` repository secret
3. Set `GITHUB_TOKEN` permissions to `contents: write` in repo settings (required for Changesets to push the version PR and for `repowiki.yml` to commit wiki updates)

---

## Package Responsibilities

### `packages/cli`
- Oclif root: declares plugin dependencies, entry point (`bin/repowiki`)
- Aggregates `plugin-wiki`, `plugin-context`, `plugin-spec` as Oclif plugins
- Exposes `repowiki help`, version, and plugin management commands
- Published to npm as `repowiki-cli` (unscoped package name)
- Required `package.json` `oclif` config block:
  ```json
  "oclif": {
    "bin": "repowiki",
    "dirname": "repowiki",
    "commands": "./dist/commands",
    "plugins": [
      "@repowiki/plugin-wiki",
      "@repowiki/plugin-context",
      "@repowiki/plugin-spec"
    ]
  }
  ```
- **Yarn Berry + Oclif known friction:** `nodeLinker: node-modules` is required (Oclif uses `require()` hooking incompatible with PnP). Additionally, `@oclif/core` historically has peer dep issues with Yarn Berry. The scaffold is not complete until `yarn install` succeeds cleanly. If resolution errors occur, add `packageExtensions` in `.yarnrc.yml` — for example:
  ```yaml
  packageExtensions:
    "@oclif/core@*":
      peerDependenciesMeta:
        "typescript":
          optional: true
  ```
  Document any required extensions in `.yarnrc.yml` comments.

### `packages/core`
- Zero runtime dependencies (pure TypeScript interfaces and types)
- Defines the three extension interfaces:
  ```ts
  interface LLMProvider {
    complete(messages: ChatMessage[]): Promise<string>
  }

  interface OutputBackend {
    write(path: string, content: string): Promise<void>
    read(path: string): Promise<string>
    query(embedding: number[]): Promise<WikiNode[]>
  }

  interface Analyzer {
    analyze(repoPath: string): Promise<WikiNode[]>
  }

  interface WikiNode {
    path: string        // logical path in the wiki hierarchy
    title: string
    summary: string
    children: WikiNode[]
  }

  interface ChatMessage {
    role: 'system' | 'user' | 'assistant'
    content: string
  }
  ```
- Defines shared config schema (`RepowikiConfig` type, mirrors `repowiki.config.ts` shape)
- All other packages depend on `core`; `core` depends on nothing internal

### `packages/plugin-wiki` (Phase 1A: scaffold only)
- Oclif plugin declaring commands: `wiki:generate`, `wiki:update`, `wiki:validate`
- Phase 1A: commands exist and print "not yet implemented"
- Phase 1B: real implementation

### `packages/plugin-context` (Phase 1A: scaffold only)
- Commands: `context:index`, `context:query`, `context:serve`
- Phase 1A: placeholder stubs only

### `packages/plugin-spec` (Phase 1A: scaffold only)
- Commands: `spec:sdd`, `spec:atdd`, `spec:review`
- Phase 1A: placeholder stubs only

---

## GitHub Actions

### `ci.yml` — runs on every PR

```
jobs:
  lint:       biome check .
  build:      yarn workspaces foreach run build         # runs first; each package.json must have "build": "tsup"
  typecheck:  yarn workspaces foreach run typecheck     # needs: build; each package.json must have "typecheck": "tsc --noEmit"
  test:       yarn workspaces foreach run test          # each package.json must have "test": "vitest run"
```

`typecheck` depends on `build` to resolve cross-package type references (`@repowiki/core` types must be emitted before other packages can type-check against them). All four jobs must pass before merge.

Each `package.json` in `packages/` must define exactly these scripts: `build`, `typecheck`, `test`.

### `release.yml` — runs on push to `main`

Driven by Changesets:
1. If changesets are present: open a "Version Packages" PR (bumps versions, updates CHANGELOG)
2. When that PR is merged: publish changed packages to npm

Uses `GITHUB_TOKEN` (auto) and `NPM_TOKEN` (repository secret).

### `repowiki.yml` — dogfood workflow

```
trigger: push to main, paths: ['packages/**']
jobs:
  wiki-update:
    - checkout
    - install repowiki-cli from npm
    - repowiki wiki update --provider=openai   # "openai" is the LiteLLM provider key (Phase 1B defines valid values)
    - commit .repowiki/** with "chore: update repowiki"
```

Phase 1A: workflow uses a conditional to skip wiki steps when the package is not yet published:
```yaml
- name: Install repowiki-cli
  id: install
  run: npm install -g repowiki-cli
  continue-on-error: true
- name: Update wiki
  if: steps.install.outcome == 'success'
  run: repowiki wiki update --provider=openai
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
- name: Commit wiki
  if: steps.install.outcome == 'success'
  uses: stefanzweifel/git-auto-commit-action@v5
  with:
    commit_message: "chore: update repowiki"
    file_pattern: ".repowiki/**"
```
Workflow always exits 0. Becomes fully operational after Phase 1B npm publish.

---

## GitHub Community Files

### Issue templates

**`bug_report.yml`** — structured form:
- Describe the bug
- Steps to reproduce
- Expected vs actual behavior
- Environment (OS, Node version, repowiki version, LLM provider)

**`feature_request.yml`** — structured form:
- Problem statement
- Proposed solution
- Which layer this affects (wiki / context / spec / core / other)

### `PULL_REQUEST_TEMPLATE.md`

Checklist:
- [ ] Changeset added (`yarn changeset`)
- [ ] Tests added or updated
- [ ] Docs updated if behavior changed
- [ ] `biome check` passes locally

### `CODE_OF_CONDUCT.md`

Contributor Covenant v2.1, verbatim.

---

## CONTRIBUTING.md

Three contributor paths:

**1. Bug fix / feature**  
Standard fork → branch → PR flow. Requires a changeset. Includes development setup (Node 20+, Yarn Berry, `yarn install`, `yarn workspaces foreach run build`).

**2. Language analyzer**  
- Implement `Analyzer` interface from `@repowiki/core`
- Reference implementation (TypeScript analyzer in `packages/plugin-wiki`) available from Phase 1B onward — Phase 1A CONTRIBUTING.md notes this as "coming in Phase 1B"
- Publish as a separate npm package (`repowiki-plugin-analyzer-<lang>`)
- Register via `repowiki plugins:install`

**3. Output backend**  
- Implement `OutputBackend` interface from `@repowiki/core`
- Interface spec published alongside Phase 1B
- Publish as a separate npm package (`repowiki-plugin-backend-<name>`)

---

## `docs/` Structure

```
docs/
├── architecture.md      # Three-layer architecture + extension interfaces (contributor-facing)
├── providers.md         # LLM provider configuration (stub in Phase 1A)
├── harnesses.md         # Per-harness integration guide (stub in Phase 1A)
└── superpowers/
    └── specs/           # Design documents
```

`docs/architecture.md` is written in Phase 1A with the interface definitions from `packages/core`.

`docs/providers.md` and `docs/harnesses.md` are created in Phase 1A as stubs — each contains a `# Title` heading and a single line "Documentation coming in Phase 1B." Both files count toward Phase 1A completion.

---

## README Updates

Two new sections added before "The Problem":

### `Installation`
```bash
npm install -g repowiki-cli
# Node.js 20+ required
# Requires: OpenAI API key / Anthropic API key / Ollama
```

### `Quick Start`
```bash
repowiki wiki generate --provider=openai
repowiki wiki generate --harness=claude-code
repowiki wiki validate
```

Both added to `README.md` and `README.zh.md`.

---

## Out of Scope for Phase 1A

- Wiki generation logic
- LiteLLM integration
- Tree-sitter parsing
- Vector database backends
- MCP server implementation

---

## Success Criteria

Phase 1A is complete when:
1. `yarn install && yarn workspaces foreach run build` succeeds from repo root
2. `yarn workspaces foreach run vitest run` passes (scaffold tests)
3. `biome check .` exits 0
4. All three GitHub Actions workflow files are present and valid YAML (`act --list` or `actionlint` passes)
5. After running `yarn workspaces foreach run tsup`: `node packages/cli/bin/run.js --help` lists all three command groups with stubs
6. `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue templates, and PR template are present
7. `docs/architecture.md` documents the three core interfaces from `packages/core`
8. README `Installation` and `Quick Start` sections exist in both EN and ZH
