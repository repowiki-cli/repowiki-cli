# summarize

> Path: `plugin-wiki/src/pipeline/summarize`

## Overview
The `summarize` module in the `plugin-wiki` package provides utilities for handling text summarization with retry logic. It includes `callWithRetry`, a function for executing a callback with retry capabilities, and `summarizeModule` and `summarizeParent`, functions用于 generating summaries for modules and their parent contexts. These functions are designed to enhance robustness and provide structured summaries within the wiki plugin system.

## Exports
- `function callWithRetry`
- `function summarizeModule`
- `function summarizeParent`
