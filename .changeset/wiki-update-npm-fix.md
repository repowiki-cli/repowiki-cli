---
"repowiki-cli": minor
"@repowiki/plugin-wiki": minor
"@repowiki/plugin-context": patch
"@repowiki/plugin-spec": patch
"@repowiki/core": patch
---

feat: implement plugin-wiki Phase 1B — full wiki:generate / wiki:validate / wiki:update pipeline

### New features

**`wiki:generate`**
- TypeScript/JavaScript source analysis via Tree-sitter (export extraction, JSDoc, monorepo package detection, directory-tree collapsing)
- Concurrent LLM summarization with configurable `--concurrency` and 429 rate-limit retry
- Bottom-up parent-node summarization (packages → directories → project)
- Markdown output to `.repowiki/` with v2 manifest (SHA-256 hashes + summaries)
- Harness config generation: `--harness=claude-code` writes to `CLAUDE.md`, `--harness=cursor` to `.cursorrules`
- `--dry-run` preview, `--estimate` token count
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
