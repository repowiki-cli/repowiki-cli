# createProvider

> Path: `plugin-wiki/src/providers/createProvider`

## Overview
The `createProvider` module provides functions for creating and managing providers within the application. It exports `createProvider`, which is used to instantiate a provider, and `providerEnvKey`, which returns the corresponding environment variable name for a given provider key, or null if none is needed. This module helps in abstracting provider configuration and environment integration.

## Exports
- `function createProvider`
- `function providerEnvKey` — Returns the env var name for a provider key, or null if not needed.
