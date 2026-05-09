import { Command } from '@oclif/core'

export default class WikiValidate extends Command {
  static description = 'Check wiki freshness against codebase'

  static examples = ['<%= config.bin %> wiki validate']

  async run(): Promise<void> {
    this.log('not yet implemented')
  }
}
