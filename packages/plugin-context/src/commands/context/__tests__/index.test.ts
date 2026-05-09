import { describe, it, expect } from 'vitest'
import ContextIndex from '../index.js'

// Oclif note: commands/context/index.ts becomes the topic root command,
// invoked as `repowiki context` (not `repowiki context index`).
// This is the Oclif convention for default topic commands.
describe('context (index — topic root)', () => {
  it('has a description', () => {
    expect(ContextIndex.description).toBeDefined()
    expect(typeof ContextIndex.description).toBe('string')
  })
})
