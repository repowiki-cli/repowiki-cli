---
"@repowiki/plugin-wiki": minor
---

feat: add real-time progress display to wiki:generate

- Emits structured progress events at every pipeline phase boundary (analyze, summarize-modules, summarize-parents, write, finished, abort)
- TTY mode: in-place line overwrite with terminal-width truncation
- CI/non-TTY mode: one log line per phase
- New `--quiet` flag to suppress all progress output
- Zero new runtime dependencies
