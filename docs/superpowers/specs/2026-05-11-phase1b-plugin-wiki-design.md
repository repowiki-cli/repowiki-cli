# Phase 1B — plugin-wiki Core Implementation Design

**Date:** 2026-05-11
**Scope:** `wiki:generate` (Tree-sitter analysis + LLM summarization + Markdown output + harness config), `wiki:validate` (staleness check). `wiki:update` remains stub (v0.2).
**Prerequisite:** Phase 1A complete (monorepo scaffold, all packages build and test clean).
**Next phase:** Phase 1C — `plugin-context` (RAG indexing + MCP server)

---

## Glossary

**WikiNode** — the unit of the wiki hierarchy, defined in `@repowiki/core`: `{ path, title, summary, children }`. Four node types in practice: `project` (root), `package` (monorepo workspace), `directory` (intermediate path segment), `module` (single source file).

**AnalyzedNode** — `plugin-wiki`-internal extension of `WikiNode` that adds `type` and `exports`. Not exported from `@repowiki/core`. Defined in `packages/plugin-wiki/src/types.ts` (shared by all plugin-wiki layers to avoid circular imports):
```ts
export type NodeType = 'project' | 'package' | 'directory' | 'module'
export interface ExportEntry { kind: 'class' | 'interface' | 'type' | 'function' | 'const'; name: string; jsDoc?: string }
export interface AnalyzedNode extends WikiNode { type: NodeType; exports: ExportEntry[]; children: AnalyzedNode[] }

export interface ProviderOptions { model?: string; apiKey?: string; baseURL?: string }

export interface GenerateOptions {
  provider: string        // required
  model?: string
  apiKey?: string
  harness?: 'claude-code' | 'cursor'
  dryRun: boolean
  estimate: boolean
  concurrency: number     // default 5
  repoPath: string        // always process.cwd() in Phase 1B
  outputPath: string      // default '.repowiki', resolved to absolute before use
}

export interface ValidateOptions {
  repoPath: string        // always process.cwd() in Phase 1B
  outputPath: string      // default '.repowiki', resolved to absolute before use
}
```
`TypeScriptAnalyzer.analyze()` returns `AnalyzedNode[]` (assignable to `WikiNode[]` per the `Analyzer` interface). The returned array always contains exactly one element: the root `project` node. All pipeline code casts the result to `AnalyzedNode[]` and accesses `[0]` as the root.

**manifest** — `.repowiki/.manifest.json`: maps each analyzed source file to its content hash and wiki output path. Used by `wiki:validate` to detect stale wiki.

**harness config** — a config file consumed by an AI coding harness (e.g. `CLAUDE.md` for Claude Code, `.cursorrules` for Cursor) that injects wiki context into the harness's session.

**tagged block** — the region in a harness config file bounded by `<!-- repowiki:start -->` and `<!-- repowiki:end -->`. HarnessWriter replaces this block on re-runs, leaving the rest of the file intact.

---

## Overview

Phase 1B implements the first working end-to-end feature of `repowiki-cli`: given a TypeScript/JavaScript repository, produce a layered Markdown wiki in `.repowiki/` that any AI harness can consume, and optionally write a harness-specific config file (`CLAUDE.md`, `.cursorrules`).

Deliverables:
1. `wiki:generate` — full pipeline: Tree-sitter analysis → LLM summarization → `.repowiki/` output + optional harness config
2. `wiki:validate` — manifest-based staleness check; exits non-zero when wiki is out of sync
3. Six LLM provider adapters (OpenAI, Anthropic, Ollama, DashScope, DeepSeek, OpenAI-compat custom endpoint)
4. Two harness generators (Claude Code, Cursor)
5. Dogfooding: run `wiki:generate --harness=claude-code` on this repo itself; update README and CLAUDE.md

---

## Scope Boundaries

**In scope:**
- TypeScript/TSX/JavaScript/JSX source analysis via Tree-sitter
- LLM-generated summaries for each WikiNode
- Local Markdown output backend (`.repowiki/` directory)
- Manifest-based staleness validation
- Harness config generation for Claude Code and Cursor (non-destructive tagged-block writes)
- `--dry-run`, `--estimate`, `--concurrency`, `--model`, `--api-key` flags

**Out of scope (future phases):**
- `wiki:update` incremental diff-aware update (v0.2)
- RAG indexing, vector search, MCP server (Phase 1C / v0.2)
- SDD/ATDD generation (Phase 1D / v0.3)
- Non-TypeScript/JS languages (v1.0)
- `repowiki.config.ts` file support (v0.2 — flags take precedence for now)

---

## Architecture

`@repowiki/core` remains zero runtime dependency (pure TypeScript interfaces). All concrete implementations live in `packages/plugin-wiki`.

```
packages/plugin-wiki/src/
├── types.ts                          ← AnalyzedNode, ExportEntry, NodeType, GenerateOptions, ValidateOptions, ProviderOptions
├── analyzers/
│   └── typescript/
│       ├── TypeScriptAnalyzer.ts     ← implements Analyzer
│       ├── queries.ts                ← Tree-sitter S-expression queries
│       └── __tests__/
├── providers/
│   ├── OpenAIProvider.ts             ← implements LLMProvider (OpenAI SDK)
│   ├── AnthropicProvider.ts          ← implements LLMProvider (@anthropic-ai/sdk)
│   ├── createProvider.ts             ← factory: key + opts → LLMProvider
│   └── __tests__/
├── backends/
│   ├── LocalMarkdownBackend.ts       ← implements OutputBackend
│   ├── ManifestManager.ts            ← .repowiki/.manifest.json read/write
│   └── __tests__/
├── harness/
│   ├── ClaudeCodeHarness.ts          ← generates CLAUDE.md tagged block
│   ├── CursorHarness.ts              ← generates .cursorrules tagged block
│   ├── HarnessWriter.ts              ← non-destructive tagged-block file writes
│   └── __tests__/
├── pipeline/
│   ├── GeneratePipeline.ts           ← orchestrates analyze → summarize → write
│   ├── ValidatePipeline.ts           ← manifest diff
│   └── __tests__/
└── commands/wiki/
    ├── generate.ts                   ← thin oclif command layer
    ├── validate.ts
    ├── update.ts                     ← stub (unchanged)
    └── __tests__/
```

**Dependency rule:** `plugin-wiki` depends on `@repowiki/core` (interfaces only). No plugin depends on another plugin.

---

## Data Model & Output Structure

### WikiNode Tree (runtime)

Four node types produced by `TypeScriptAnalyzer`:

| Type | Condition | `path` example | Output file |
|---|---|---|---|
| `project` | root node | `repowiki-cli` | `_index.md` |
| `package` | monorepo workspace (`packages/*/`) | `core` | `core/_index.md` |
| `directory` | intermediate path segment with ≥2 children | `plugin-wiki/src/commands/wiki` | `plugin-wiki/src/commands/wiki/_index.md` |
| `module` | single source file | `plugin-wiki/src/commands/wiki/generate` | `plugin-wiki/src/commands/wiki/generate.md` |

**Path mapping rule** (used by pipeline, backend, manifest, and harness generators):
- `project` → `{outputPath}/_index.md`
- `package` → `{outputPath}/{node.path}/_index.md`
- `directory` → `{outputPath}/{node.path}/_index.md`
- `module` → `{outputPath}/{node.path}.md`

Single-repo projects (no `packages/` structure) collapse to: `project` → `module` (no intermediate nodes).

### .repowiki/ Directory Layout

```
.repowiki/
├── .manifest.json
├── _index.md               ← project-level WikiNode
├── core/
│   ├── _index.md           ← package-level WikiNode
│   └── src/
│       └── index.md        ← module-level WikiNode
├── plugin-wiki/
│   ├── _index.md
│   └── src/
│       └── commands/
│           └── wiki/
│               ├── _index.md
│               ├── generate.md
│               └── validate.md
└── ... (other packages)
```

### Markdown File Format

Each `.md` file follows this template:

```markdown
# {title}

> Path: `{path}`

## Overview
{LLM-generated summary}

## Exports
- `{kind} {name}` — {one-line description from JSDoc or LLM}

## Children
- [{child.title}]({relative path to child wiki file})
```

**Children link rule:** links are relative paths computed via `path.relative(path.dirname(parentWikiFilePath), childWikiFilePath)`. For example, `plugin-wiki/_index.md` links to its child `plugin-wiki/src/commands/wiki/generate.md` as `./src/commands/wiki/generate.md`.

**Section presence rules:**
- `## Exports` appears only on `module`-type nodes. Project/package/directory nodes omit it.
- `## Children` appears only when `node.children.length > 0`. Module leaf nodes omit it.

### .manifest.json Format

```json
{
  "version": 1,
  "generatedAt": "2026-05-11T14:00:00.000Z",
  "provider": "anthropic",
  "files": {
    "packages/core/src/index.ts": {
      "hash": "sha256:abc123...",
      "wikiPath": ".repowiki/core/src/index.md"
    }
  }
}
```

Paths in `files` are relative to the repository root. `hash` uses Node.js built-in `crypto.createHash('sha256')` — no extra dependency.

---

## Analyzer Layer

### TypeScriptAnalyzer

**Dependencies added to `plugin-wiki`:** `tree-sitter`, `tree-sitter-typescript`

**File discovery:**
1. `fast-glob` scans for `**/*.{ts,tsx,js,jsx}` from the target repo root with `followSymbolicLinks: false` (prevents duplicates and infinite loops from symlinked directories)
2. `ignore` package loads `.gitignore` rules; also hard-excludes `node_modules/`, `dist/`, `__tests__/`, `*.test.*`, `*.spec.*`
3. If zero files are found after exclusions, the analyzer still returns a `project` root node with `children: []`; the pipeline detects this and exits with `"No TypeScript/JavaScript source files found in {repoPath}"` + `process.exit(1)`

**Per-file extraction via Tree-sitter queries (`queries.ts`):**
- All top-level `export` declarations: class, interface, type alias, function, const/let/var
- Export kind (`class` | `interface` | `type` | `function` | `const`)
- Leading JSDoc comment (if present) — passed to LLM as summary hint

**WikiNode tree assembly:**
1. Group files by workspace package (detected via `packages/*/package.json` name fields; fallback to directory name). Non-monorepo repos have no `package` nodes.
2. Build `package` (`AnalyzedNode`) nodes as children of the root `project` node
3. Within each package, group module files by intermediate directory: create `directory` nodes for any path segment that contains ≥2 source files or has further sub-directories. Apply the collapse rule **recursively bottom-up until stable**: any `directory` node with exactly one child has its child promoted one level up (the directory node is removed); then re-check the parent, continuing until no further collapse is possible. `package` nodes are never collapsed. Worked example: if `plugin-wiki` contains only `src/commands/wiki/generate.ts`, the chain `src/ → commands/ → wiki/ → generate` collapses fully to `plugin-wiki → generate` (module is a direct child of the package).
4. Build `module` nodes (one per source file) as leaf children of their nearest parent (`package` or `directory`)
5. File path → `node.path`: strip repo root prefix and `.ts`/`.tsx`/`.js`/`.jsx` extension; normalize to forward slashes using `path.posix` (or replace `path.sep` with `/` on Windows). Assert the resulting path contains no `..` segments — reject files with traversal paths. Manifest `files` keys use the same forward-slash-normalized format.

**Output:** `AnalyzedNode[]` (assignable to `WikiNode[]`) containing exactly one element — the root `project` node — with `summary: ''` throughout. Summaries are populated by the pipeline.

**Manifest key format:** Manifest `files` keys are the original discovered file paths relative to `repoPath`, with forward slashes (e.g., `packages/core/src/index.ts`). They are **not** the same as `node.path` (which has the extension stripped and the `packages/` prefix removed for monorepos). Compute manifest keys from the raw `fast-glob` output before transforming to `node.path`.

---

## LLM Provider Layer

### createProvider Factory

```
createProvider(key: string, opts: ProviderOptions): LLMProvider
```

| `--provider` value | Implementation | Default model | API key env var |
|---|---|---|---|
| `openai` | `OpenAIProvider` | `gpt-4o-mini` | `OPENAI_API_KEY` |
| `anthropic` | `AnthropicProvider` | `claude-haiku-4-5-20251001` | `ANTHROPIC_API_KEY` |
| `ollama` | `OpenAIProvider` (`http://localhost:11434/v1`) | `llama3` | — |
| `dashscope` | `OpenAIProvider` (`https://dashscope.aliyuncs.com/compatible-mode/v1`) | `qwen-turbo` | `DASHSCOPE_API_KEY` |
| `deepseek` | `OpenAIProvider` (`https://api.deepseek.com/v1`) | `deepseek-chat` | `DEEPSEEK_API_KEY` |
| `openai-compat:URL` | `OpenAIProvider` (custom baseURL) | `gpt-4o-mini` | `OPENAI_API_KEY` |

`dashscope`, `deepseek`, and `ollama` reuse `OpenAIProvider` — no additional classes needed.

`--model` flag overrides the default model for any provider. `--api-key` flag overrides the environment variable lookup.

### OpenAIProvider

Uses `openai` npm SDK. Constructor accepts `{ apiKey, baseURL, model }`. `complete(messages)` calls `client.chat.completions.create({ model, messages, max_tokens: 1024 })` and returns `choices[0].message.content`.

### AnthropicProvider

Uses `@anthropic-ai/sdk`. Builds the `system` parameter by joining all `system`-role messages with `\n\n`. All remaining messages are passed as `{ role: 'user' | 'assistant', content }` — any remaining `system`-role message in the non-first position throws `Error('AnthropicProvider: only one system block is supported')`. Calls `client.messages.create({ model, max_tokens: 1024, system, messages })`.

### Summarization Prompt

Applied to every WikiNode leaf (module-level):

```
System: You are a technical writer. Generate concise wiki entries for a software codebase. 
        Be specific and factual. Do not hallucinate APIs that are not listed.

User: Write a 2–3 sentence summary for this TypeScript module.

Path: {node.path}
Exports:
{export list: "- kind name — JSDoc first line (if any)"}
```

Package-level and project-level nodes receive this prompt (applied after their children are summarized):

```
System: You are a technical writer. Generate concise wiki entries for a software codebase.
        Be specific and factual.

User: Write a 2–3 sentence summary for this {type} node in a TypeScript project.
      It contains the following children:
      {child list: "- {child.title}: {child.summary (first sentence)}"}
```

---

## Backend Layer

### LocalMarkdownBackend

Implements `OutputBackend`:
- `write(path, content)`: resolves final path as `path.resolve(this.outputPath, relativePath)`, asserts it starts with `this.outputPath` (path traversal guard), then `fs.mkdir({ recursive: true })` + `fs.writeFile`
- `read(path)`: `fs.readFile` with the same resolution
- `query()`: returns `[]` (RAG is Layer 2 / Phase 1C)

All paths passed to `write`/`read` are relative to `outputPath` (injected at construction time). Absolute paths and `..` segments are rejected at the assertion step.

### ManifestManager

Reads/writes `.repowiki/.manifest.json`:
- `load()`: returns parsed manifest or `null` if file does not exist
- `save(manifest)`: atomic write (write to `.manifest.json.tmp`, then `fs.rename`)
- `computeHash(filePath)`: SHA-256 of file content via `crypto.createHash('sha256')`

---

## Harness Layer

### HarnessGenerator Interface

Both harness generators implement (defined in `src/types.ts`):
```ts
export interface HarnessGenerator {
  /** Returns the inner content of the tagged block — WITHOUT the delimiter tags. */
  generate(root: AnalyzedNode): string
  /** Absolute path to the target config file. */
  targetFile(repoPath: string): string
}
```

`ClaudeCodeHarness` and `CursorHarness` both implement this interface.

`generate(root)` collects module nodes via depth-first traversal of `root.children` (filtering `node.type === 'module'`), then sorts by `node.path` ascending.

### HarnessWriter (non-destructive)

`HarnessWriter.write(filePath: string, innerContent: string): Promise<void>`

The `innerContent` parameter is the raw content WITHOUT the delimiter tags. `HarnessWriter` is solely responsible for wrapping with `<!-- repowiki:start -->\n{innerContent}\n<!-- repowiki:end -->`.

Algorithm:
1. If file does not exist: create it containing only the tagged block
2. If file exists and contains `<!-- repowiki:start -->` followed by `<!-- repowiki:end -->` (find the first occurrence of each, in order): replace from the first `<!-- repowiki:start -->` to the first `<!-- repowiki:end -->` that follows it (inclusive) with the new wrapped content
3. If file exists and contains `<!-- repowiki:start -->` but no subsequent `<!-- repowiki:end -->` (crashed previous run): emit a warning "Unclosed repowiki block found in `{filePath}`"; remove the line containing `<!-- repowiki:start -->` (including its trailing newline); then append `\n\n{wrapped content}` at end of file
4. If file exists but has no tags: append `\n\n` + the new wrapped content

Running `wiki:generate --harness=X` multiple times is idempotent: the block is replaced in place; all other file content is preserved.

### ClaudeCodeHarness

`targetFile(repoPath)` returns `path.join(repoPath, 'CLAUDE.md')`.

`generate(root)` returns inner content (no delimiter tags):

```markdown
## RepoWiki — Auto-generated Context

> Generated by `repowiki wiki generate --harness=claude-code`. Do not edit this block manually.

### Project Overview
{root.summary}

### Key Modules
| Path | Description |
|------|-------------|
| `{path}` | {summary (first sentence)} |
| ...  | ...          |
```

Only `module`-type nodes appear in the table, sorted by `node.path`.

### CursorHarness

`targetFile(repoPath)` returns `path.join(repoPath, '.cursorrules')`.

`generate(root)` returns inner content with Cursor-specific framing:

```markdown
# RepoWiki Context

When working in this codebase, use the following context:

## Project Overview
{root.summary}

## Key Modules
| Path | Description |
|------|-------------|
| `{path}` | {summary (first sentence)} |
| ...  | ...          |
```

Only `module`-type nodes appear in the table, sorted by `node.path`.

---

## Pipeline Layer

### GeneratePipeline

Input: `GenerateOptions` (provider key, model, apiKey, harness?, dryRun, estimate, concurrency, repoPath, outputPath)

`--estimate` and `--dry-run` are mutually exclusive; if both are set, `--estimate` takes precedence.

Steps:
1. Validate flags and environment: (a) if `--estimate` and `--dry-run` are both set, `--estimate` takes precedence and a notice is printed; (b) resolve `outputPath = path.resolve(repoPath, rawOutputPath)` and assert it starts with `path.resolve(repoPath)` — if not, print `"--output must be inside the repo root"` and `process.exit(1)`; (c) if the chosen provider requires an API key (all except `ollama`) and none is found via `--api-key` or the env var, print `"No API key found. Set {ENV_VAR} or pass --api-key."` and `process.exit(1)` — before any file system or network operations.
2. Instantiate `TypeScriptAnalyzer`, call `analyzer.analyze(repoPath)` → `AnalyzedNode[]`; take `root = result[0]` as the project root.
3. If `--estimate`: use `js-tiktoken` (cl100k_base encoding) to count tokens for all module-level summarization prompts; print total input token count and a note: "Estimated tokens: {count}. Actual cost depends on your provider's pricing. Non-OpenAI providers may differ by ±30%."; `process.exit(0)`. (No prices are hard-coded.)
4. Instantiate `createProvider(key, opts)` → `LLMProvider`
5. Summarize `AnalyzedNode`s:
   - Collect all `module`-type leaf nodes via depth-first traversal
   - Process leaves in batches of `concurrency` (default 5) with concurrent `provider.complete()` calls; collect results into `Map<AnalyzedNode, string>` (keyed by node object identity — no mutation during concurrent phase)
   - On any LLM error: abort immediately, print the error, `process.exit(1)` — no partial wiki written
   - After all leaf batches complete, apply the map: `node.summary = summaryMap.get(node)!` for each leaf in a single sequential pass
   - Then process non-leaf nodes bottom-up (`directory` → `package` → `project`): for each, build the parent prompt reading from `node.summary` (already set on children), call `provider.complete()`, set `node.summary` sequentially (no concurrency needed for parent nodes — there are far fewer)
6. Generate Markdown content for every `AnalyzedNode` using the path mapping rule and Markdown template
7. Compute SHA-256 hashes for all analyzed source files (for manifest)
8. If `--dry-run`: print the list of files that would be written; `process.exit(0)`
9. Instantiate `LocalMarkdownBackend(outputPath)`, write all wiki Markdown files
10. `ManifestManager.save(manifest)`. If manifest save fails after wiki files are written, print a warning: "Wiki files written but manifest could not be saved. Re-run `wiki generate` to restore consistency." Do not exit 1 — wiki files are usable without the manifest for reading; only `validate` is broken.
11. After manifest save, check whether the `outputPath` directory is excluded by `.gitignore`. If so, print a warning: "`{outputPath}` appears to be gitignored. Add `!{outputPath}/` to `.gitignore` if you intend to commit the wiki." (non-fatal)
12. If `--harness`: instantiate the appropriate `HarnessGenerator`; call `HarnessWriter.write(generator.targetFile(repoPath), generator.generate(root))`
13. Print summary: files written, LLM calls made, wall-clock time

### ValidatePipeline

Input: `ValidateOptions` (repoPath, outputPath)

Steps:
1. `ManifestManager.load()` — if null, print error "wiki not found, run `repowiki wiki generate` first" and `process.exit(1)`
2. Run `TypeScriptAnalyzer` file discovery (no LLM calls)
3. For each discovered source file: compute SHA-256 hash
4. Compare with manifest:
   - **stale**: file in manifest but hash differs
   - **new**: file discovered but not in manifest
   - **deleted**: file in manifest but no longer exists on disk
5. If any stale/new/deleted entries: print categorized list, `process.exit(1)`
6. If clean: print "wiki is up to date ✓", `process.exit(0)`

---

## CLI Commands

### wiki:generate flags

| Flag | Type | Default | Description |
|---|---|---|---|
| `--provider` | string | **required** (`required: true` in oclif — update existing stub which has `required: false`) | LLM provider key (see provider table) |
| `--harness` | string | — | Generate harness config: `claude-code` or `cursor` |
| `--model` | string | provider default | Override LLM model |
| `--api-key` | string | from env | Override API key |
| `--output` | string | `.repowiki` | Wiki output directory |
| `--concurrency` | int | `5` | Max concurrent LLM calls |
| `--dry-run` | boolean | `false` | Preview output without writing files |
| `--estimate` | boolean | `false` | Print token count and cost estimate, then exit |

**`repoPath` default:** In Phase 1B, `repoPath` is always `process.cwd()` for both commands. No `--repo` flag is exposed.

### wiki:validate flags

| Flag | Type | Default | Description |
|---|---|---|---|
| `--output` | string | `.repowiki` | Wiki directory to validate against |

---

## New Dependencies

Added to `packages/plugin-wiki/package.json`:

| Package | Type | Purpose |
|---|---|---|
| `tree-sitter` | dep | AST parsing runtime (native bindings) |
| `tree-sitter-typescript` | dep | TypeScript/TSX grammar |
| `fast-glob` | dep | File discovery |
| `ignore` | dep | .gitignore rule parsing |
| `openai` | dep | OpenAI / Ollama / DashScope / DeepSeek / OpenAI-compat providers |
| `@anthropic-ai/sdk` | dep | Anthropic provider |
| `js-tiktoken` | dep | Token counting for `--estimate` (cl100k_base; output prints ±30% disclaimer for non-OpenAI providers) |

No new dependencies are added to `@repowiki/core`, `packages/cli`, or other packages.

**tree-sitter native bindings note:** `tree-sitter` compiles native N-API bindings via `node-gyp` at install time. CI pipelines must have `python3`, `make`, and `gcc`/`clang` available. Verify prebuilt binaries are available for the target platforms (Linux x64, macOS arm64) via the `tree-sitter` npm package's `prebuilds/` directory before committing to this dependency. If CI complexity is unacceptable, `web-tree-sitter` (pure WASM, no native bindings) is a drop-in alternative at the cost of ~2× slower parsing on large repos.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| `--output` escapes repo root | `process.exit(1)`: `"--output must be inside the repo root"` |
| Zero source files found | `process.exit(1)`: `"No TypeScript/JavaScript source files found in {repoPath}"` |
| Missing API key | `process.exit(1)`: `"No API key found. Set {ENV_VAR} or pass --api-key."` — before any analysis |
| LLM API error (any provider) | Abort pipeline; `process.exit(1)` — no partial wiki written |
| LLM rate limit (429) | Retry once after 5 s; if second attempt fails, treat as API error |
| Tree-sitter parse failure on a file | Skip file, emit `[warn] failed to parse {filePath}: {message}` to stderr, continue |
| File-system write error | Print error and `process.exit(1)` |
| Manifest save fails after wiki files written | Print warning (non-fatal): `"Wiki files written but manifest could not be saved. Re-run wiki generate."` |
| `outputPath` gitignored | Print warning (non-fatal): `"{outputPath} appears to be gitignored."` |
| `--estimate` + `--dry-run` both set | `--estimate` takes precedence; print notice |
| Unclosed repowiki block in harness file | Print warning; strip orphaned start tag; append new block |
| `node.path` contains `..` segments | `process.exit(1)`: reject the file |
| `wiki:validate` with no manifest | `process.exit(1)`: `"Wiki not found. Run wiki generate first."` |
| `wiki:validate` clean | `process.exit(0)`: `"wiki is up to date"` |
| `wiki:validate` stale | `process.exit(1)`: print categorized list (stale / new / deleted files) |

---

## Testing Strategy

| Layer | Approach |
|---|---|
| `TypeScriptAnalyzer` | Fixture: `packages/core/src/index.ts`. Assert: root `node.type === 'project'`; root has one `package` child with `node.path === 'core'`; that child has one `module` child with `node.path === 'core/src/index'`; module node has 6 exports named `WikiNode`, `LLMProvider`, `OutputBackend`, `Analyzer`, `ChatMessage`, `RepowikiConfig`; all `summary` fields are `''` |
| `OpenAIProvider` | `vi.mock('openai')`; assert `chat.completions.create` called with `{ model: 'gpt-4o-mini', messages: [...], max_tokens: 1024 }`; assert custom `baseURL` is forwarded for DashScope/DeepSeek/Ollama |
| `AnthropicProvider` | `vi.mock('@anthropic-ai/sdk')`; assert `system` built from system messages; assert non-system messages mapped to `user`/`assistant`; assert error thrown on second system-role message |
| `createProvider` | Assert each of 6 keys produces the correct class instance and (for OpenAI-compat variants) the correct `baseURL` |
| `LocalMarkdownBackend` | Write to `os.tmpdir()`; assert file at expected path contains expected content; assert `..` path throws; assert nested directories are created |
| `ManifestManager` | Write to temp dir; assert `hash` field starts with `sha256:`; assert `load()` returns `null` when file absent; assert atomic write (`.tmp` then rename) |
| `HarnessWriter` | Four scenarios: (1) new file → file created with delimiters; (2) existing with tags → only block replaced, rest preserved; (3) existing without tags → content appended; (4) unclosed start tag → warning emitted, orphaned tag removed, new block appended; assert idempotency on repeat runs |
| `GeneratePipeline` | Fixture: temp dir with `src/index.ts` (2 exports) and `src/utils.ts` (1 export). Mock `LLMProvider.complete()` to return `"mock summary"`. Assert: `.repowiki/_index.md` exists; `.repowiki/src/index.md` and `.repowiki/src/utils.md` exist; manifest has 2 entries with `sha256:` hashes; `--dry-run` produces no files; `--estimate` exits 0 without writing |
| `ValidatePipeline` | Four states: (1) manifest absent → exit 1; (2) manifest matches → exit 0; (3) file modified (hash mismatch) → exit 1, file listed as "stale"; (4) new file added → exit 1, file listed as "new" |

All tests run via `vitest run` with no network calls. LLM calls are always mocked in tests.

---

## Post-Implementation: Dogfooding & Doc Updates

After `wiki:generate` is working:

1. **Dogfood:** Run `node packages/cli/bin/run.js wiki generate --provider=anthropic --harness=claude-code` in this repo, commit the resulting `.repowiki/` directory and updated `CLAUDE.md`
2. **README updates:**
   - Tick completed v0.1 roadmap items
   - Change badge from `Status: Design Phase` to `Status: Alpha`
   - Update `repowiki.yml` workflow: remove `continue-on-error` guard (CLI now published to npm)
3. **CLAUDE.md updates:**
   - Remove "Pre-v0.1 design phase — all command `run()` bodies currently log `'not yet implemented'`" status line
   - Add local run example: `node packages/cli/bin/run.js wiki generate --provider=anthropic`
   - Add environment variable reference: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DASHSCOPE_API_KEY`, `DEEPSEEK_API_KEY`

---

## Success Criteria

Phase 1B is complete when:
1. `node packages/cli/bin/run.js wiki generate --provider=anthropic` runs end-to-end on this repo without error (requires `ANTHROPIC_API_KEY`)
2. `.repowiki/` directory is present with `_index.md` and per-module Markdown files
3. `node packages/cli/bin/run.js wiki validate` exits 0 immediately after generate
4. Modifying any source file causes `wiki validate` to exit 1
5. `--harness=claude-code` produces a valid `CLAUDE.md` tagged block; re-running is idempotent
6. `--dry-run` prints the file list without writing anything
7. `yarn test` passes across all packages (all LLM calls mocked)
8. `yarn build && yarn typecheck && yarn lint` exit 0
