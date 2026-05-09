import { Command, Flags } from '@oclif/core'

export default class WikiGenerate extends Command {
  static description = 'Analyze repo and produce layered wiki'

  static examples = ['<%= config.bin %> wiki generate --provider=openai']

  static flags = {
    provider: Flags.string({
      description: 'LLM provider (e.g. openai, anthropic, ollama)',
      required: false,
    }),
    harness: Flags.string({
      description: 'Generate harness config file (e.g. claude-code, cursor)',
      required: false,
    }),
    estimate: Flags.boolean({
      description: 'Estimate LLM cost without running generation',
      default: false,
    }),
    'dry-run': Flags.boolean({
      description: 'Preview output without writing files',
      default: false,
    }),
  }

  async run(): Promise<void> {
    this.log('not yet implemented')
  }
}
