import * as path from 'node:path';
import { Command, Flags } from '@oclif/core';
import dotenv from 'dotenv';
import { ValidatePipeline } from '../../pipeline/ValidatePipeline.js';

export default class WikiValidate extends Command {
  static description = 'Check wiki freshness against codebase';

  static examples = ['<%= config.bin %> wiki validate'];

  static flags = {
    output: Flags.string({
      description: 'Wiki directory to validate against',
      default: '.repowiki',
    }),
  };

  async run(): Promise<void> {
    dotenv.config({ path: path.join(process.cwd(), '.env'), override: false });

    const { flags } = await this.parse(WikiValidate);
    const repoPath = process.cwd();
    const outputPath = path.resolve(repoPath, flags.output);
    const pipeline = new ValidatePipeline();
    await pipeline.run({ repoPath, outputPath });
  }
}
