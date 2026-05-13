export type ProgressEvent =
  | { type: 'analyze:start' }
  | { type: 'analyze:done'; moduleCount: number }
  | { type: 'summarize-modules:start'; total: number }
  | { type: 'summarize-modules:item'; index: number; total: number; path: string }
  | { type: 'summarize-modules:done'; elapsed: number }
  | { type: 'summarize-parents:start'; total: number }
  | { type: 'summarize-parents:item'; index: number; total: number; title: string }
  | { type: 'summarize-parents:done'; elapsed: number }
  | { type: 'write:done'; fileCount: number; elapsed: number }
  | { type: 'finished'; fileCount: number; llmCalls: number; elapsed: number }
  | { type: 'abort'; reason: string }

export type ProgressReporter = (event: ProgressEvent) => void

export function createProgressReporter(opts: { quiet: boolean }): ProgressReporter {
  if (opts.quiet) return () => {};
  return Boolean(process.stdout.isTTY) ? createTtyReporter() : createCiReporter();
}

function createCiReporter(): ProgressReporter {
  return (event) => {
    switch (event.type) {
      case 'analyze:start':
        process.stdout.write('Analyzing repository...\n');
        break;
      case 'summarize-modules:start':
        process.stdout.write(`Summarizing ${event.total} modules...\n`);
        break;
      case 'summarize-parents:start':
        process.stdout.write(`Summarizing ${event.total} packages/directories...\n`);
        break;
      case 'write:done':
        process.stdout.write(`Written ${event.fileCount} wiki files\n`);
        break;
      case 'finished':
        process.stdout.write(
          `Done: ${event.fileCount} wiki files, ${event.llmCalls} LLM calls, ${(event.elapsed / 1000).toFixed(1)}s\n`,
        );
        break;
      case 'abort':
        process.stdout.write(`${event.reason}\n`);
        break;
    }
  };
}

function createTtyReporter(): ProgressReporter {
  let currentLineLen = 0;
  let modulesTotal = 0;
  let parentsTotal = 0;

  function writeProgress(text: string): void {
    const maxLen = (process.stdout.columns ?? 80) - 1;
    const truncated = text.slice(0, maxLen);
    if (currentLineLen > 0) {
      process.stdout.write('\r' + ' '.repeat(currentLineLen) + '\r');
    }
    process.stdout.write(truncated);
    currentLineLen = truncated.length;
  }

  function writeLine(text: string): void {
    if (currentLineLen > 0) {
      process.stdout.write('\r' + ' '.repeat(currentLineLen) + '\r');
      currentLineLen = 0;
    }
    process.stdout.write(`${text}\n`);
  }

  return (event) => {
    switch (event.type) {
      case 'analyze:start':
        writeProgress('Analyzing repository...');
        break;
      case 'analyze:done':
        writeLine(`✓ Analyzed ${event.moduleCount} module${event.moduleCount !== 1 ? 's' : ''}`);
        break;
      case 'summarize-modules:start':
        modulesTotal = event.total;
        break;
      case 'summarize-modules:item':
        writeProgress(`Summarizing modules [${event.index}/${event.total}] ${event.path}`);
        break;
      case 'summarize-modules:done':
        writeLine(`✓ Summarized ${modulesTotal} modules (${(event.elapsed / 1000).toFixed(1)}s)`);
        break;
      case 'summarize-parents:start':
        parentsTotal = event.total;
        break;
      case 'summarize-parents:item':
        writeProgress(
          `Summarizing packages/directories [${event.index}/${event.total}] ${event.title}`,
        );
        break;
      case 'summarize-parents:done':
        writeLine(
          `✓ Summarized ${parentsTotal} packages/directories (${(event.elapsed / 1000).toFixed(1)}s)`,
        );
        break;
      case 'write:done':
        writeLine(`✓ Written ${event.fileCount} wiki files (${(event.elapsed / 1000).toFixed(1)}s)`);
        break;
      case 'finished':
        writeLine(
          `Done: ${event.fileCount} wiki files, ${event.llmCalls} LLM calls, ${(event.elapsed / 1000).toFixed(1)}s`,
        );
        break;
      case 'abort':
        writeLine(event.reason);
        break;
    }
  };
}
