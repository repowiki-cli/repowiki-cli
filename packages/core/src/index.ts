export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface WikiNode {
  path: string
  title: string
  summary: string
  children: WikiNode[]
}

export interface LLMProvider {
  complete(messages: ChatMessage[]): Promise<string>
}

export interface OutputBackend {
  write(path: string, content: string): Promise<void>
  read(path: string): Promise<string>
  query(embedding: number[]): Promise<WikiNode[]>
}

export interface Analyzer {
  analyze(repoPath: string): Promise<WikiNode[]>
}

export interface RepowikiConfig {
  provider: string
  backend: string
  analyzerLanguages: string[]
}
