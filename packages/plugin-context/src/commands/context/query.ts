import { Args, Command } from '@oclif/core';

export default class ContextQuery extends Command {
  static description = 'Query context by natural language or path';

  static args = {
    query: Args.string({ description: 'Natural language query or module path', required: true }),
  };

  async run(): Promise<void> {
    this.log('not yet implemented');
  }
}
