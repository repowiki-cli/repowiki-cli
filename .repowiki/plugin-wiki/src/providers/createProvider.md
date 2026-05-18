# createProvider

> Path: `plugin-wiki/src/providers/createProvider`

## Overview
The `createProvider` module exports a function used to create a provider instance, along with `providerEnvKey`, which returns the corresponding environment variable name for a given provider key or `null` if not applicable. This module is part of a larger system for managing and configuring providers within the application. It helps in abstracting the environment variable handling for different provider configurations.

## Exports
- `function createProvider`
- `function providerEnvKey` — Returns the env var name for a provider key, or null if not needed.
