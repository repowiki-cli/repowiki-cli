# summarize

> Path: `plugin-wiki/src/pipeline/summarize`

## Overview
The `summarize` module in the `plugin-wiki` package provides utilities for generating summaries of code modules and handling potential errors during the summarization process. It includes `callWithRetry` for retrying failed operations, `buildModuleMessages` for constructing message sequences, and `summarizeModule` and `summarizeParent` for generating summaries of individual modules and their parent contexts, respectively. These functions work together to ensure robust and context-aware documentation generation.

## Exports
- `function callWithRetry`
- `function buildModuleMessages`
- `function summarizeModule`
- `function summarizeParent`
