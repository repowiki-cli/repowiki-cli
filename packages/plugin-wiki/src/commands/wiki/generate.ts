import * as path from 'node:path';
import { Command, Flags } from '@oclif/core';
import dotenv from 'dotenv';
import { GeneratePipeline } from '../../pipeline/GeneratePipeline.js';
import { createProvider, providerEnvKey } from '../../providers/createProvider.js';

export default class WikiGenerate extends Command {
  static description = 'Analyze repo and produce layered wiki';

  static examples = [
    '<%= config.bin %> wiki generate --provider=openai',
    '<%= config.bin %> wiki generate --provider=anthropic --harness=claude-code',
    '<%= config.bin %> wiki generate --provider=dashscope --harness=claude-code',
    '<%= config.bin %> wiki generate --provider=azure --model=my-deployment --harness=claude-code',
    '<%= config.bin %> wiki generate --provider=ollama --model=llama3 --dry-run',
  ];

  static flags = {
    provider: Flags.string({
      description:
        'LLM provider: openai | anthropic | azure | ollama | dashscope | deepseek | openai-compat:URL',
      required: true,
    }),
    harness: Flags.string({
      description: 'Generate harness config: claude-code | cursor',
      required: false,
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
    'dry-run': Flags.boolean({
      description: 'Preview output without writing files',
      default: false,
    }),
    estimate: Flags.boolean({
      description: 'Print estimated token count and exit',
      default: false,
    }),
  };

  async run(): Promise<void> {
    // Load .env from the current working directory (override: false keeps explicit env vars)
    dotenv.config({ path: path.join(process.cwd(), '.env'), override: false });

    const { flags } = await this.parse(WikiGenerate);
    const repoPath = process.cwd();
    const rawOutput = flags.output;
    const outputPath = path.resolve(repoPath, rawOutput);

    // Path traversal guard
    const resolvedRoot = path.resolve(repoPath);
    if (!outputPath.startsWith(resolvedRoot + path.sep) && outputPath !== resolvedRoot) {
      this.error('--output must be inside the repo root');
    }

    // API key validation (skip for ollama and estimate mode)
    if (!flags.estimate) {
      const envKey = providerEnvKey(flags.provider);
      if (envKey && !flags['api-key'] && !process.env[envKey]) {
        this.error(`No API key found. Set ${envKey} or pass --api-key.`);
      }
    }

    if (flags.estimate && flags['dry-run']) {
      this.log('Note: --estimate takes precedence over --dry-run.');
    }

    const provider = createProvider(flags.provider, {
      model: flags.model,
      apiKey: flags['api-key'],
    });

    const pipeline = new GeneratePipeline(provider);
    await pipeline.run({
      provider: flags.provider,
      model: flags.model,
      apiKey: flags['api-key'],
      harness: flags.harness as 'claude-code' | 'cursor' | undefined,
      dryRun: flags['dry-run'],
      estimate: flags.estimate,
      concurrency: flags.concurrency,
      repoPath,
      outputPath,
    });
  }
}
