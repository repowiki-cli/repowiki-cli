# @repowiki/plugin-wiki

## 0.2.0

### Minor Changes

- [#14](https://github.com/repowiki-cli/repowiki-cli/pull/14) [`a81ce42`](https://github.com/repowiki-cli/repowiki-cli/commit/a81ce42a30976196386cc54c383671bbbd6c275a) Thanks [@Oscaner](https://github.com/Oscaner)! - wiki:generate and wiki:update now cover all source files in monorepos, including those outside packages/ (e.g. scripts/, bin/, root-level .ts/.js files). wiki:validate now uses analyzeWithFileMap() for consistent file discovery. UpdatePipeline prunes empty directories after wiki file deletion. Existing monorepo wikis should be regenerated with wiki:generate after upgrading.

## 0.1.0

### Minor Changes

- [#1](https://github.com/repowiki-cli/repowiki-cli/pull/1) [`cb0dabf`](https://github.com/repowiki-cli/repowiki-cli/commit/cb0dabfc53cfdf7b5cb2a25d3d002aee7a01a93d) Thanks [@Oscaner](https://github.com/Oscaner)! - feat: implement plugin-wiki Phase 1B — full wiki:generate / wiki:validate / wiki:update pipeline

  ### New features

  **`wiki:generate`**

  - TypeScript/JavaScript source analysis via Tree-sitter (export extraction, JSDoc, monorepo package detection, directory-tree collapsing)
  - Concurrent LLM summarization with configurable `--concurrency` and 429 rate-limit retry
  - Bottom-up parent-node summarization (packages → directories → project)
  - Markdown output to `.repowiki/` with v2 manifest (SHA-256 hashes + summaries)
  - Harness config generation: `--harness=claude-code` writes to `CLAUDE.md`, `--harness=cursor` to `.cursorrules`
  - `--dry-run` preview, `--estimate` token count, `--quiet` to suppress progress output
  - Real-time progress display: TTY in-place line overwrite, CI one-line-per-phase, structured `ProgressEvent` API
  - `.env` auto-load from cwd

  **`wiki:validate`**

  - Manifest diff against current source files; exits 1 when stale/new/deleted files found
  - Suitable for CI pre-merge gate

  **`wiki:update`**

  - Incremental re-generation: re-summarizes only changed files (via manifest hash comparison)
  - Full regeneration fallback when no manifest exists

  **LLM providers**

  - `openai` (GPT-4o default), `anthropic` (Claude 3.5 Sonnet default), `azure` (Azure OpenAI)
  - `dashscope` (Qwen via OpenAI-compat), `deepseek`, `ollama`, `openai-compat:<URL>`

  **Harness writers**

  - `ClaudeCodeHarness`: non-destructive tagged-block writes to `CLAUDE.md`
  - `CursorHarness`: non-destructive tagged-block writes to `.cursorrules`

  **Infrastructure**

  - `prepack` script validates `workspace:` refs before npm publish
  - `scripts/check-workspace-refs.js` blocks accidental `workspace:*` leaks into published packages

### Patch Changes

- Updated dependencies [[`cb0dabf`](https://github.com/repowiki-cli/repowiki-cli/commit/cb0dabfc53cfdf7b5cb2a25d3d002aee7a01a93d)]:
  - @repowiki/core@0.0.2
