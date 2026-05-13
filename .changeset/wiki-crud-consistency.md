---
"@repowiki/plugin-wiki": minor
---

wiki:generate and wiki:update now cover all source files in monorepos, including those outside packages/ (e.g. scripts/, bin/, root-level .ts/.js files). wiki:validate now uses analyzeWithFileMap() for consistent file discovery. UpdatePipeline prunes empty directories after wiki file deletion. Existing monorepo wikis should be regenerated with wiki:generate after upgrading.
