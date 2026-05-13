# Design: npm Publish Fix + wiki:update Command

**Date:** 2026-05-12  
**Branch:** feat/phase1b-plugin-wiki  
**Status:** Approved

## Problem Statement

Three interconnected failures prevent `npx repowiki-cli@latest` from working:

1. All five packages were published to npm with `workspace:*` still in their dependencies. npm does not understand this Yarn-only protocol, so installation fails with `EUNSUPPORTEDPROTOCOL`.
2. No guard prevents this from happening again via a manual publish that bypasses changesets.
3. The `wiki:update` command is an empty stub, breaking the `repowiki.yml` dogfood CI workflow that calls it on every push to `main`.

## Scope

Three components delivered in one PR. The PR itself only contains code changes; the npm deprecation of 0.0.1 and the changeset bump are separate steps performed after merge.

---

## Component 1: Publish Safety Guard

### Goal

Make it structurally impossible to publish a package with unresolved `workspace:` references, while keeping the existing `yarn changeset publish` CI workflow transparent.

### Mechanism

Add a `prepack` lifecycle script to all five `package.json` files:

- `packages/core/package.json`
- `packages/plugin-wiki/package.json`
- `packages/plugin-context/package.json`
- `packages/plugin-spec/package.json`
- `packages/cli/package.json`

**Why `prepack`, not `prepublishOnly`:** Yarn Berry's `yarn npm publish` (the verb used internally by `yarn changeset publish`) runs `prepack`/`postpack` hooks only. It does not run `prepublishOnly`. Using `prepack` ensures the guard fires on both the Yarn Berry publish path and the `npm publish` path.

The script is an inline `node -e "..."` one-liner in the `scripts` block (no separate file needed):

```json
"prepack": "node -e \"const p=require('./package.json');const all={...p.dependencies,...p.devDependencies,...p.peerDependencies,...p.optionalDependencies};const bad=Object.entries(all).filter(([,v])=>v&&v.startsWith('workspace:'));if(bad.length){console.error('ERR: workspace: refs not resolved: '+bad.map(([k])=>k).join(', '));process.exit(1)}\""
```

The check covers `dependencies`, `devDependencies`, `peerDependencies`, and `optionalDependencies`.

### Why This Works with Changesets

`yarn changeset publish` calls `changeset version` first, which rewrites every `workspace:*` to the resolved version (e.g. `^0.0.2`) in `package.json`. By the time `prepack` fires, all `workspace:` references are already replaced — the check passes. If someone runs `yarn npm publish` or `npm publish` directly without running `changeset version` first, `prepack` finds unresolved `workspace:` and fails immediately.

### Version Bump and npm Deprecation

After the PR is merged:

1. **Create changeset:** `yarn changeset` — select patch for all five packages. This produces the 0.0.1 → 0.0.2 bump.
2. **Merge the Release PR** created by `changesets/action`. The action runs `yarn changeset publish`, which converts `workspace:*` and publishes correctly.
3. **Deprecate broken 0.0.1** — developer runs manually with npm token set:
   ```bash
   npm deprecate repowiki-cli@0.0.1 "broken: workspace deps not resolved; upgrade to 0.0.2"
   npm deprecate @repowiki/plugin-wiki@0.0.1 "broken: workspace deps not resolved; upgrade to 0.0.2"
   npm deprecate @repowiki/plugin-context@0.0.1 "broken: workspace deps not resolved; upgrade to 0.0.2"
   npm deprecate @repowiki/plugin-spec@0.0.1 "broken: workspace deps not resolved; upgrade to 0.0.2"
   npm deprecate @repowiki/core@0.0.1 "broken: workspace deps not resolved; upgrade to 0.0.2"
   ```

---

## Component 2: `wiki:update` Incremental Command

### Goal

Re-summarize only the source files that changed since the last `wiki:generate`. Identical behaviour to `wiki:generate` for affected nodes; zero LLM calls for unchanged nodes.

### Manifest Schema: v1 → v2

The current `Manifest` (version 1) stores only `hash` and `wikiPath` per source file. UpdatePipeline needs the LLM-generated summary of each unchanged module to rebuild parent summaries without extra LLM calls. The schema is extended to version 2:

```ts
// packages/plugin-wiki/src/types.ts

// Old (v1):
export interface Manifest {
  version: 1;
  generatedAt: string;
  provider: string;
  files: Record<string, { hash: string; wikiPath: string }>;
}

// New (v2):
export interface ManifestV2 {
  version: 2;
  generatedAt: string;
  provider: string;
  files: Record<string, { hash: string; wikiPath: string; summary: string }>;
}

export type AnyManifest = Manifest | ManifestV2;
```

`ManifestManager.load()` return type becomes `Promise<AnyManifest | null>`. Callers distinguish by checking `manifest.version`.

`GeneratePipeline` is updated to save v2 manifests (includes the `summary` string for each module node). No breaking change to the wiki file output; only the `.manifest.json` format changes.

If `UpdatePipeline` loads a v1 manifest, it exits 1:

> `"Wiki manifest is outdated. Run \`repowiki wiki generate\` to upgrade."`

### New File: `pipeline/summarize.ts`

Extracts and centralises the LLM summarization logic from `GeneratePipeline`. Both pipelines import from here.

**Exports:**

```ts
export async function summarizeModule(
  node: AnalyzedNode,
  provider: LLMProvider,
): Promise<string>
```

Builds the per-file prompt (identical to current `buildModulePrompt` in `GeneratePipeline`), calls the provider, returns the summary string. Contains the `callWithRetry` helper (moved from `GeneratePipeline`): retries once after 5 s on HTTP 429; throws on any other error.

```ts
export async function summarizeParent(
  node: AnalyzedNode,
  provider: LLMProvider,
): Promise<string>
```

Builds the bottom-up aggregation prompt from `node.children[i].summary` (same approach as current `summarizeNonLeaves` in `GeneratePipeline`). Callers are responsible for ensuring all child `.summary` fields are populated before calling this function.

`GeneratePipeline` is refactored to import both functions. Its external behaviour is unchanged.

### New File: `pipeline/UpdatePipeline.ts`

```ts
export class UpdatePipeline {
  constructor(private readonly provider: LLMProvider) {}
  async run(opts: UpdateOptions): Promise<void>
}
```

**Pipeline steps:**

**Step 1 — Load manifest**

`ManifestManager.load()`. If null → exit 1 "Wiki not found. Run `repowiki wiki generate` first." If `manifest.version === 1` → exit 1 "Wiki manifest is outdated. Run `repowiki wiki generate` to upgrade."

**Step 2 — Analyse repo**

`TypeScriptAnalyzer.analyzeWithFileMap(repoPath)` → `{ root, fileMap }`. The `fileMap` keys are relative paths matching the manifest's `files` keys.

**Step 3 — Diff**

Using `fileMap.keys()` as the current file list (no second call to `discoverFiles`):

- `stale`: `[...fileMap.keys()]` that exist in `manifest.files` but whose hash differs.
- `new`: `[...fileMap.keys()]` that have no entry in `manifest.files`.
- `deleted`: keys in `manifest.files` that are not in `fileMap`.

Hash computation: `ManifestManager.computeHash(path.join(repoPath, relPath))`.

If all three sets are empty → print `"wiki is up to date"`, exit 0.

**Step 4 — Populate summaries for unchanged module nodes**

For every entry in `fileMap` that is *not* in `stale` or `new`, set `node.summary = manifest.files[relPath].summary` on the corresponding `AnalyzedNode`. This ensures parent summarization receives complete child summaries even for unchanged siblings.

**Step 5 — Re-summarize stale + new module nodes**

Concurrent batches (size = `opts.concurrency`). For each node: `node.summary = await summarizeModule(node, provider)`.

**Step 6 — Rebuild affected parent summaries (bottom-up)**

Determine the set of changed relative paths: `changedPaths = new Set([...stale, ...new])`.

Recursive DFS from `root`:

```
function rebuildAffected(node, changedPaths, provider):
  if node.type === 'module': return
  for each child of node.children:
    await rebuildAffected(child, changedPaths, provider)
  if any child.path (or any descendant path) is in changedPaths:
    node.summary = await summarizeParent(node, provider)
```

Parent summaries are rebuilt leaf-to-root (bottom-up via post-order DFS), so each parent sees already-updated child summaries.

**Step 7 — Delete wiki files for deleted source files**

For each `relPath` in `deleted`:
- Wiki file path: `manifest.files[relPath].wikiPath` (already absolute, stored at generate time by `GeneratePipeline`).
- Call `LocalMarkdownBackend.delete(wikiPath)` (see new method below).
- Remove `relPath` from the in-memory manifest `files` map.

**Step 8 — Write updated wiki files**

Write wiki files for all re-summarized nodes (stale, new module nodes + rebuilt parent nodes). No content comparison — write unconditionally for every node that was summarized in steps 5–6. Uses `LocalMarkdownBackend.write()` with the same markdown rendering as `GeneratePipeline`.

**Step 9 — Save manifest**

Build the updated `ManifestV2` object:
- `version: 2`
- `generatedAt`: current ISO timestamp (`new Date().toISOString()`)
- `provider`: `opts.provider` (the provider used for this update run)
- `files`: updated map — remove deleted entries, add/update stale and new entries with new hash + wikiPath + summary

Call `ManifestManager.save(updatedManifest)` (atomic write).

**Step 10 — Print summary**

`"X updated, Y deleted, Z skipped"` where:
- updated = stale.length + new.length + affected parent count
- deleted = deleted.length
- skipped = unchanged module count

### `LocalMarkdownBackend` — New `delete` Method

Add to `packages/plugin-wiki/src/backends/LocalMarkdownBackend.ts`:

```ts
async delete(absolutePath: string): Promise<void>
```

Accepts the absolute path (same format as `wikiPath` in the manifest). Validates the path is within `this.outputPath` (path-traversal guard — same logic as the existing write guard). Calls `fs/promises.unlink`. If the file does not exist, silently succeeds (idempotent).

### Command: `commands/wiki/update.ts`

Flags:

| Flag | Type | Required | Default | Description |
|---|---|---|---|---|
| `--provider` | string | yes | — | LLM provider (same values as `wiki:generate`) |
| `--model` | string | no | — | Override LLM model |
| `--api-key` | string | no | — | Override API key |
| `--output` | string | no | `.repowiki` | Wiki output directory |
| `--concurrency` | integer | no | `5` | Max concurrent LLM calls |

Flags omitted (generate-only): `--dry-run`, `--estimate`, `--harness`.

API key validation: same logic as `wiki:generate` — skip check when provider's `providerEnvKey()` returns null (covers `ollama`). `repoPath` is always `process.cwd()`.

### `types.ts` Additions

```ts
export interface UpdateOptions {
  provider: string;
  model?: string;
  apiKey?: string;
  repoPath: string;
  outputPath: string;
  concurrency: number;
}
```

---

## Component 3: `repowiki.yml` CI Fix

The `repowiki.yml` dogfood workflow already contains the correct invocation:

```yaml
- name: Install repowiki-cli
  run: npm install -g repowiki-cli
- name: Update wiki
  run: repowiki wiki update --provider=dashscope --model=qwen3-max
```

No changes to the workflow file are needed. The workflow becomes functional once:

1. `repowiki-cli@0.0.2` is published correctly (Component 1 + changeset merge).
2. `wiki:update` is implemented (Component 2).

**Known limitation:** If `wiki:generate --harness=claude-code` was run with flags that differ from the default, `CLAUDE.md` may drift over time since `wiki:update` does not touch the harness config. This is intentional; the harness is regenerated only on explicit `wiki:generate` runs.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| No manifest | Exit 1: "Wiki not found. Run `repowiki wiki generate` first." |
| v1 manifest (no summaries) | Exit 1: "Wiki manifest is outdated. Run `repowiki wiki generate` to upgrade." |
| LLM 429 | Retry once after 5 s (same as `GeneratePipeline`). If retry also 429 → treated as non-retryable error. |
| LLM non-retryable error | Abort. Print error. Exit 1. Wiki files written so far remain on disk; manifest is NOT saved. |
| Wiki file write error | Abort. Same as LLM non-retryable error. |
| Output path outside repo root | Exit 1: "--output must be inside the repo root" |
| Missing API key | Exit 1: "No API key found. Set ENV_VAR or pass --api-key." |

**Partial-write note:** If the pipeline aborts mid-step-8 (file write errors), some wiki files may be partially updated while the manifest reflects the old state. On the next `wiki:update` run the manifest hashes still match the source files, so the pipeline exits "wiki is up to date" without correcting the orphaned files. Users can always run `wiki:generate` to force a clean regeneration. This is the same limitation that exists in `GeneratePipeline` today and is explicitly accepted.

---

## Testing

**`summarize.ts` unit tests** (`packages/plugin-wiki/src/pipeline/__tests__/summarize.test.ts`):
- Mock provider returns a fixed string.
- Assert `summarizeModule` builds the expected prompt structure and returns provider output.
- Assert `summarizeParent` reads child `.summary` fields and builds the expected aggregation prompt.
- Assert `callWithRetry` retries once on 429 and throws on second failure.

**`UpdatePipeline` unit tests** (`packages/plugin-wiki/src/pipeline/__tests__/UpdatePipeline.test.ts`):
- Mock `TypeScriptAnalyzer`, `ManifestManager`, `summarize`, `LocalMarkdownBackend`.
- Scenario: one stale file, one new file, one deleted file, two unchanged files.
  - Assert `summarizeModule` called exactly twice (stale + new only).
  - Assert `backend.write` called for stale + new module pages + all rebuilt parent pages.
  - Assert `backend.delete` called once with the deleted file's `wikiPath`.
  - Assert `ManifestManager.save` called with updated manifest excluding deleted entry and including new/stale entries with updated hash + summary.
- Scenario: no changes — assert early exit, no LLM calls, no writes, no manifest save.
- Scenario: v1 manifest — assert exit 1 with upgrade message.

**`GeneratePipeline` existing tests:** Must pass unchanged after the `summarize.ts` extraction. Run `yarn workspace @repowiki/plugin-wiki vitest run` to verify.

**`LocalMarkdownBackend.delete` unit tests** (add to existing backend test file):
- Assert delete removes the file when it exists.
- Assert delete is a no-op when the file does not exist.
- Assert delete rejects paths outside the output directory.

**`prepack` guard test** (`packages/cli/scripts/__tests__/prepack.test.ts` or equivalent):
- Spawn the inline node script with a mock `package.json` containing `workspace:*` — assert exit code 1.
- Spawn with a resolved `package.json` (`^0.0.2`) — assert exit code 0.

---

## Out of Scope

- `--dry-run` for `wiki:update`.
- Parallel parent summary rebuilding (bottom-up DFS is sequential; acceptable at typical diff sizes).
- Support for non-TypeScript analyzers in `UpdatePipeline`.
- Orphaned `_index.md` files left when a directory node disappears after single-child collapsing — handled by a future `wiki:clean` command.
- Detecting and correcting partial-write state from a previous aborted run.
