# Architecture

repowiki-cli is organized as a three-layer pipeline. Each layer is an independent Oclif plugin.

## Three-Layer Model

```
User's codebase
      │
      ▼
┌────────────────────────────────┐
│  Layer 1: plugin-wiki          │  wiki generate / update / validate
│  Builds layered Markdown wiki  │
└───────────────┬────────────────┘
                │ WikiNode hierarchy
                ▼
┌────────────────────────────────┐
│  Layer 2: plugin-context       │  context index / query / serve
│  Indexes wiki, serves via RAG  │
└───────────────┬────────────────┘
                │ Retrieved WikiNodes
                ▼
┌────────────────────────────────┐
│  Layer 3: plugin-spec          │  spec sdd / atdd / review
│  Generates SDD/ATDD from wiki  │
└────────────────────────────────┘
```

## Extension Interfaces (`@repowiki/core`)

All extension points are defined in `packages/core/src/index.ts`.

### LLMProvider

```typescript
interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface LLMProvider {
  complete(messages: ChatMessage[]): Promise<string>
}
```

Configured via `repowiki.config.ts` → `provider: 'openai'`. LiteLLM handles routing to the actual model endpoint (Phase 1B).

### OutputBackend

```typescript
interface OutputBackend {
  write(path: string, content: string): Promise<void>
  read(path: string): Promise<string>
  query(embedding: number[]): Promise<WikiNode[]>
}
```

Default backend: local Markdown files in `.repowiki/`.
`query()` is used by Layer 2 for RAG retrieval. Default backend returns `[]`.

### Analyzer

```typescript
interface WikiNode {
  path: string        // logical path: "src/auth"
  title: string       // human-readable name
  summary: string     // AI-generated summary
  children: WikiNode[]
}

interface Analyzer {
  analyze(repoPath: string): Promise<WikiNode[]>
}
```

Built on [Tree-sitter](https://tree-sitter.github.io). Maps AST nodes to:
- **Module boundaries** — packages or compilation units
- **Domain boundaries** — business-capability groupings
- **API contracts** — exported interfaces and public functions

## Plugin System

repowiki-cli uses [Oclif's plugin architecture](https://oclif.io/docs/plugins).

```bash
repowiki plugins:install repowiki-plugin-analyzer-rust
```

Community plugins implement interfaces from `@repowiki/core`.
