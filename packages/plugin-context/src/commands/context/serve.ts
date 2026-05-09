import { Command, Flags } from '@oclif/core'

export default class ContextServe extends Command {
  static description = 'Expose context as MCP server'

  static flags = {
    port: Flags.integer({ description: 'Port to listen on', default: 3000 }),
  }

  async run(): Promise<void> {
    this.log('not yet implemented')
  }
}
