# Commands

## wiki:generate

Analyze a TypeScript/JavaScript repository and produce a layered Markdown wiki.

```bash
repowiki wiki:generate --provider=<provider> [options]
```

### Flags

| Flag | Required | Default | Description |
|---|---|---|---|
| `--provider` | ✅ | — | LLM provider key (see [Providers](providers.md)) |
| `--harness` | — | — | Generate harness config: `claude-code` \| `cursor` |
| `--model` | — | provider default | Override LLM model or deployment name |
| `--api-key` | — | from env / `.env` | Override API key |
| `--output` | — | `.repowiki` | Wiki output directory |
| `--concurrency` | — | `5` | Max concurrent LLM calls |
| `--dry-run` | — | `false` | Print files that would be written, skip LLM calls |
| `--estimate` | — | `false` | Print estimated token count and exit |

### Examples

```bash
# DashScope (Qwen)
repowiki wiki:generate --provider=dashscope --harness=claude-code

# Anthropic Claude
repowiki wiki:generate --provider=anthropic --harness=claude-code

# OpenAI
repowiki wiki:generate --provider=openai --harness=cursor

# Azure OpenAI (deployment name via --model)
repowiki wiki:generate --provider=azure --model=my-gpt4o-deployment --harness=claude-code

# Ollama (local, no API key required)
repowiki wiki:generate --provider=ollama --model=qwen2.5-coder

# DeepSeek
repowiki wiki:generate --provider=deepseek

# Preview without writing (no LLM calls)
repowiki wiki:generate --provider=dashscope --dry-run

# Estimate token cost
repowiki wiki:generate --provider=dashscope --estimate
```

### .env support

`wiki:generate` automatically loads `.env` from the current working directory before reading environment variables. Set your API key in `.env`:

```
DASHSCOPE_API_KEY=sk-...
```

Explicit environment variables (`export DASHSCOPE_API_KEY=...`) always take precedence over `.env`.

---

## wiki:validate

Check whether the wiki is in sync with the current codebase.

```bash
repowiki wiki:validate [--output <dir>]
```

Exits `0` if up to date, exits `1` with a categorized diff (stale / new / deleted files) if not.

### Flags

| Flag | Default | Description |
|---|---|---|
| `--output` | `.repowiki` | Wiki directory to validate |

### Examples

```bash
# Default
repowiki wiki:validate

# Custom output directory
repowiki wiki:validate --output=docs/wiki
```

Use in CI to block PRs when the wiki is stale:

```yaml
- run: repowiki wiki:validate
```

---

## wiki:update

Incrementally update wiki based on git-diff (v0.2, coming soon).

---

## context:index / context:query / context:serve

Layer 2 context routing — coming in Phase 1C.

---

## spec:sdd / spec:atdd / spec:review

Layer 3 SDD/ATDD generation — coming in Phase 1D.
