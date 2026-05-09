import { Command } from '@oclif/core'

// Oclif treats commands/context/index.ts as the topic root command.
// This command is invoked as `repowiki context` (the default context action).
export default class ContextIndex extends Command {
  static description = 'Build retrieval index from wiki'

  async run(): Promise<void> {
    this.log('not yet implemented')
  }
}
