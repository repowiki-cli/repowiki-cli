import * as path from 'node:path';
import { Command, Flags } from '@oclif/core';
import dotenv from 'dotenv';
import { UpdatePipeline } from '../../pipeline/UpdatePipeline.js';
import { createProvider, providerEnvKey } from '../../providers/createProvider.js';

export default class WikiUpdate extends Command {
  static description = 'Incrementally update wiki for files changed since last generate';

  static examples = [
    '<%= config.bin %> wiki update --provider=openai',
    '<%= config.bin %> wiki update --provider=dashscope --model=qwen3-max',
    '<%= config.bin %> wiki update --provider=azure --model=my-deployment',
  ];

  static flags = {
    provider: Flags.string({
      description:
        'LLM provider: openai | anthropic | azure | ollama | dashscope | deepseek | openai-compat:URL',
      required: true,
    }),
    model: Flags.string({
      description: 'Override LLM model (default depends on provider)',
      required: false,
    }),
    'api-key': Flags.string({
      description: 'Override API key (default: read from env)',
      required: false,
    }),
    output: Flags.string({
      description: 'Wiki output directory',
      default: '.repowiki',
    }),
    concurrency: Flags.integer({
      description: 'Max concurrent LLM calls',
      default: 5,
    }),
  };

  async run(): Promise<void> {
    dotenv.config({ path: path.join(process.cwd(), '.env'), override: false });

    const { flags } = await this.parse(WikiUpdate);
    const repoPath = process.cwd();
    const rawOutput = flags.output;
    const outputPath = path.resolve(repoPath, rawOutput);

    const resolvedRoot = path.resolve(repoPath);
    if (!outputPath.startsWith(resolvedRoot + path.sep) && outputPath !== resolvedRoot) {
      this.error('--output must be inside the repo root');
    }

    const envKey = providerEnvKey(flags.provider);
    if (envKey && !flags['api-key'] && !process.env[envKey]) {
      this.error(`No API key found. Set ${envKey} or pass --api-key.`);
    }

    const provider = createProvider(flags.provider, {
      model: flags.model,
      apiKey: flags['api-key'],
    });

    const pipeline = new UpdatePipeline(provider);
    await pipeline.run({
      provider: flags.provider,
      model: flags.model,
      apiKey: flags['api-key'],
      concurrency: flags.concurrency,
      repoPath,
      outputPath,
    });
  }
}
