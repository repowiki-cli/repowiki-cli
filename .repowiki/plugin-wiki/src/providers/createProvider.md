# createProvider

> Path: `plugin-wiki/src/providers/createProvider`

## Overview
The `createProvider` module exports a function used to create a provider instance, along with `providerEnvKey`, which returns the corresponding environment variable name for a given provider key or `null` if none is needed. This module is part of the wiki plugin system and helps manage provider configurations through environment variables. It provides utilities for initializing and referencing providers within the application.

## Exports
- `function createProvider`
- `function providerEnvKey` — Returns the env var name for a provider key, or null if not needed.
