# repowiki-cli

> AI-Native engineering toolkit for large-scale multi-repo projects.  
> Solve context explosion. Build institutional AI memory. Scale AI-assisted development across your entire codebase.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Status: Alpha](https://img.shields.io/badge/Status-Alpha-orange.svg)]()

> **Note:** v0.1-alpha is shipped. `wiki:generate` and `wiki:validate` are fully functional. Layers 2 and 3 are in development.

---

## Installation

```bash
npm install -g repowiki-cli
```

**Prerequisites:**
- Node.js 20 or higher
- One of: OpenAI API key / Anthropic API key / Azure OpenAI / DashScope API key / DeepSeek API key / [Ollama](https://ollama.ai) running locally

## Quick Start

```bash
# Generate wiki (DashScope / Qwen)
repowiki wiki:generate --provider=dashscope --harness=claude-code

# Generate wiki (Anthropic)
repowiki wiki:generate --provider=anthropic --harness=claude-code

# Generate wiki (Azure OpenAI — --model sets the deployment name)
repowiki wiki:generate --provider=azure --model=my-gpt4o-deployment

# Validate wiki is in sync with codebase
repowiki wiki:validate

# Preview without writing (no LLM calls)
repowiki wiki:generate --provider=dashscope --dry-run
```

API keys can be set via environment variables or a `.env` file in the project root. See [docs/providers.md](docs/providers.md) for all supported providers.

---

## The Problem: Why Large Projects Break AI

Most AI coding tools shine on single files or small repositories. The moment you scale to a real-world product — multiple repositories, thousands of files, dozens of domain boundaries — the promise falls apart.

Three forces work against you:

**Context explosion.** No LLM can hold your entire codebase in its context window. You end up copy-pasting fragments and hoping the AI fills in the missing pieces. It doesn't.

**Fragmentation.** Your 8 repos don't talk to each other in the AI's mind. The authentication service has no idea about the billing model. The frontend team's AI has never "seen" the API contracts. Every session starts from zero.

**Team inconsistency.** When each engineer prompts the AI differently, you get different answers to the same architectural questions. AI output becomes unpredictable. Review cycles lengthen. The promised 10× productivity gain turns into a 1.5× gain with a side of confusion.

The root cause isn't the AI. It's the absence of structured, machine-readable context that reflects how your system actually works.

**But isn't this solved by Cursor's codebase index or GitHub Copilot Workspace?**

Existing tools index your code for *search*. `repowiki-cli` builds *institutional memory*: versioned, human-readable wiki documents that live in your repo, travel with your code, work with any AI tool, and capture the *why* behind your architecture — not just the what. When your AI harness is replaced by the next generation, your wiki stays. When a new engineer joins, they read the same wiki the AI does.

---

## The Methodology: Three Layers of AI-Native Engineering

We've developed a methodology for building what we call *institutional AI memory* — a structured, versioned, queryable representation of your codebase that any AI tool can consume efficiently.

### Layer 1 — RepoWiki: Layered Context Construction

For each repository, `repowiki-cli` generates a hierarchical wiki by analyzing code structure, dependencies, and domain boundaries. Instead of dumping raw code into a context window, it builds a layered hierarchy of Markdown summary files — one per logical layer of the codebase (project overview → module overview → component detail) — that let an AI navigate from high-level architecture down to specific implementation details on demand.

The result: an AI can understand what your system does before it reads a single line of code.

### Layer 2 — Context Router: Fast Location + Fine-Grained RAG

A wiki is only useful if you can find the right part quickly. Layer 2 splits the generated wiki into indexed, queryable chunks and builds a retrieval layer on top. When an AI needs context about the payment flow, it retrieves *exactly* the relevant wiki sections — not 200k tokens of everything.

This layer exposes two retrieval interfaces: a **path-based lookup** (deterministic — given a module name or file path, return the relevant wiki section) and a **RAG interface** (semantic — given a natural language query, return the most relevant wiki chunks via vector search).

### Layer 3 — SDD/ATDD Generator: Consistency at Scale

The first two layers solve the context problem. The third closes the loop.

`repowiki-cli` uses the wiki it already knows about your system to generate project-specific Software Design Documents (SDD) and Acceptance Test specifications (ATDD templates). Because the wiki captures your architecture and conventions, generated specs stay consistent with your actual codebase — not generic AI boilerplate. These become the scaffolding for AI-assisted feature development, giving every engineer (and every AI session) the same starting point.

The outcome: AI output becomes predictable. Design reviews become faster. Onboarding new engineers (or new AI sessions) drops from days to minutes. Layers 1 and 2 are prerequisites for Layer 3 — the SDD/ATDD generator is only as good as the wiki it draws from.

---

## repowiki-cli: The Methodology as a Tool

```
repowiki-cli
├── wiki          # Layer 1: RepoWiki generation
│   ├── generate  # Analyze repo and produce layered wiki
│   ├── update    # Incremental update on code changes (v0.2)
│   └── validate  # Check wiki freshness against codebase
├── context       # Layer 2: Context routing
│   ├── index     # Build retrieval index from wiki
│   ├── query     # Query context by natural language or path
│   └── serve     # Expose context as MCP server
└── spec          # Layer 3: SDD/ATDD generation
    ├── sdd       # Generate Software Design Document
    ├── atdd      # Generate acceptance test scaffolding
    └── review    # AI-assisted spec review
```

**Key design decisions:**

- **Architecture first.** The CLI is built around extension points — new wiki analyzers, output backends, and harness adapters can be added without touching the core.
- **Provider-agnostic.** Bring your own LLM: OpenAI, Anthropic, Google, local models via Ollama. One config, any provider.
- **Output-configurable.** Wiki output defaults to local Markdown files versioned with your code. Swap in a vector database, object storage, or a custom backend via plugins.
- **CI-friendly.** Every command is designed to run headlessly in pipelines.
- **Scale-aware.** Initial wiki generation on large repos is incremental and resumable. A cost-estimation dry-run (`--estimate`) is available before committing to an LLM API call on a large codebase.

---

## AI Harness Integration

An *AI harness* is any tool that manages AI context and sessions during development — Claude Code, Cursor, Windsurf, Opencode, GitHub Copilot, and others. These tools are powerful, but they load context naively: whatever files are open, whatever you paste in.

`repowiki-cli` changes what the harness has to work with.

Wiki output is structured to be consumed by any harness's context-loading mechanism:

- **Flat Markdown files** — drop `.repowiki/` into your repo; any harness that reads project files picks it up automatically
- **Harness config generation** — `repowiki wiki generate --harness=claude-code` emits a tailored context file (e.g. `CLAUDE.md`, `.cursorrules`) optimized for that harness's loading behavior. Config generation is non-destructive by default: it appends a tagged block to existing files (preserving all prior content) and supports `--dry-run` to preview output before writing
- **MCP server mode** — `repowiki context serve` exposes a Model Context Protocol server that harnesses with MCP support can query dynamically

Harness-specific optimized presets (tuning prompt caching, context window usage, and retrieval depth) are planned for v0.3 alongside the spec generation layer.

| Harness | Flat Files | Config Gen | MCP |
|---|---|---|---|
| Claude Code | v0.1 | v0.1 | v0.2 |
| Cursor | v0.1 | v0.1 | v0.3 |
| Windsurf | v0.1 | v0.1 | v0.3 |
| Opencode | v0.1 | v0.3 | v0.3 |
| GitHub Copilot | v0.1 | v0.3 | N/A¹ |
| Other | v0.1 | — | — |

¹ GitHub Copilot does not currently support MCP. This will be revisited as the ecosystem evolves.

---

## Extensibility

`repowiki-cli` is built around three extension points:

**LLM Providers** — The core pipeline is LLM-agnostic. Built-in adapters for OpenAI, Anthropic, Azure OpenAI, DashScope (Qwen / Alibaba Cloud Bailian), DeepSeek, and Ollama (local models). Any OpenAI-compatible endpoint also works via `--provider=openai-compat:URL`. **Note:** wiki generation sends code to the configured LLM provider by default. For sensitive or IP-restricted codebases, use Ollama or a private Azure endpoint to keep code on-premise. See [docs/providers.md](docs/providers.md) for configuration details.

**Output Backends** — Wiki output is decoupled from the generation pipeline. Default: local Markdown files. Planned plugins (v1.0): [Qdrant](https://qdrant.tech) (recommended for production), [Weaviate](https://weaviate.io) (native hybrid search), Chroma (lightweight prototyping), FAISS (local embeddings), pgvector (Postgres ecosystem). The backend interface spec (read/write/query contract) will be published ahead of v1.0 to enable community backends.

**Analyzers** — Language-specific code analyzers determine how repos are parsed into wiki structures. Analyzers are built on [Tree-sitter](https://tree-sitter.github.io), an incremental parsing library supporting 165+ languages. Built-in at v0.1: TypeScript/JavaScript. Expanded at v1.0: Python, Go, Java. Community analyzers implement a published interface that maps Tree-sitter AST nodes to wiki concepts — module boundaries (packages / compilation units), domain boundaries (business-capability groupings), and API contracts (exported interfaces) — the interface spec ships ahead of v1.0.

---

## Unit Testing

Test files live next to their source files — no top-level `tests/` directory. Each source file's tests go in a sibling `__tests__/` directory with a `.test` suffix:

```
repowiki-cli/
├── wiki/
│   ├── generate.ts
│   ├── update.ts
│   └── __tests__/
│       ├── generate.test.ts
│       └── update.test.ts
├── context/
│   ├── index.ts
│   ├── query.ts
│   └── __tests__/
│       ├── index.test.ts
│       └── query.test.ts
└── spec/
    ├── sdd.ts
    └── __tests__/
        └── sdd.test.ts
```

Co-location means tests move or disappear with their module during refactors — no orphaned test files. It also means a reader can find the tests for any file without leaving its directory.

---

## GitHub Actions

### Keep the wiki up to date on every push

```yaml
# .github/workflows/repowiki-update.yml
name: Update RepoWiki

on:
  push:
    branches: [main]

jobs:
  wiki:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install -g repowiki-cli
      - run: repowiki wiki:update --provider=dashscope
        env:
          DASHSCOPE_API_KEY: ${{ secrets.DASHSCOPE_API_KEY }}
      - uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: "chore: update repowiki"
          file_pattern: ".repowiki/**"
```

Replace `dashscope` / `DASHSCOPE_API_KEY` with your preferred provider. See [docs/providers.md](docs/providers.md).

### Block PRs when the wiki is stale

```yaml
# .github/workflows/repowiki-validate.yml
name: Validate RepoWiki

on:
  pull_request:

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install -g repowiki-cli
      - run: repowiki wiki:validate
```

`repowiki wiki:validate` exits with a non-zero code if the wiki is out of sync with the current codebase, failing the PR check and prompting the author to run `repowiki wiki:generate` locally before merging.

---

## Roadmap

### v0.1 — Foundation
- [x] Core CLI architecture and extension points
- [x] Wiki generation for TypeScript/JavaScript repos
- [x] Local Markdown output backend
- [x] Wiki freshness validation (`repowiki wiki validate`)
- [x] Claude Code and Cursor harness config generation

### v0.2 — Context Routing
- [ ] Wiki indexing and RAG query interface
- [ ] MCP server mode (`repowiki context serve`) — enables Claude Code MCP integration
- [ ] Incremental wiki updates (git-diff aware), with automatic re-indexing to keep the retrieval index in sync

### v0.3 — Spec Generation
- [ ] SDD template generation from wiki
- [ ] ATDD scaffolding for feature specs
- [ ] AI-assisted spec review loop
- [ ] Harness-specific optimized presets (prompt caching, context window, retrieval depth)

### v1.0 — Production Ready
- [ ] Multi-language analyzer support (Python, Go, Java)
- [ ] Plugin ecosystem (output backends, LLM providers)
- [ ] CI/CD integration guide
- [ ] Performance benchmarks on 10+ repo projects

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and contribution paths. The highest-impact contributions right now:

- **Build a language analyzer** — if your primary language isn't TypeScript, implement the `Analyzer` interface from `@repowiki/core` and publish as `repowiki-plugin-analyzer-<lang>`.
- **Build an output backend** — implement `OutputBackend` to support vector databases (Qdrant, Weaviate, pgvector, etc.) and publish as `repowiki-plugin-backend-<name>`.
- **Share your context problem** — open an issue describing how context explosion affects your team.

---

## License

MIT




