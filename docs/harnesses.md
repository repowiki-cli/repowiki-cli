# AI Harness Integration

An *AI harness* is any tool that manages AI context and coding sessions — Claude Code, Cursor, Windsurf, Opencode, GitHub Copilot, etc.

Use `--harness=<name>` with `wiki:generate` to write a harness-specific config file alongside the wiki output.

## Supported Harnesses

| Key | Output file | Notes |
|---|---|---|
| `claude-code` | `CLAUDE.md` | Appended as a tagged block |
| `cursor` | `.cursorrules` | Appended as a tagged block |

---

## Claude Code

```bash
repowiki wiki:generate --provider=dashscope --harness=claude-code
```

Appends a `<!-- repowiki:start --> ... <!-- repowiki:end -->` block to `CLAUDE.md` containing:
- Project overview summary
- Key modules table (path → one-line description)

Re-running is **idempotent**: the block is replaced in place; all other content in `CLAUDE.md` is preserved.

---

## Cursor

```bash
repowiki wiki:generate --provider=dashscope --harness=cursor
```

Writes the same content to `.cursorrules` in the repo root.

---

## Flat Markdown files (all harnesses)

Regardless of `--harness`, `wiki:generate` always writes `.repowiki/` — a directory of Markdown files mirroring the codebase structure. Any harness that reads project files picks this up automatically.

```
.repowiki/
├── _index.md           ← project overview
├── core/
│   ├── _index.md       ← package overview
│   └── src/
│       └── index.md    ← module detail
└── plugin-wiki/
    ├── _index.md
    └── src/
        └── ...
```

---

## CI: validate wiki on every PR

```yaml
# .github/workflows/repowiki-validate.yml
- run: repowiki wiki:validate
```

Exits `1` if the wiki is stale, blocking the PR until the author runs `wiki:generate` locally.
