import { Command, Flags } from '@oclif/core';

export default class WikiUpdate extends Command {
  static description = 'Incrementally update wiki based on code changes (v0.2)';

  static flags = {
    provider: Flags.string({
      description: 'LLM provider to use',
      required: false,
    }),
  };

  async run(): Promise<void> {
    this.log('not yet implemented');
  }
}
