import { describe, it, expect } from 'vitest'
import ContextServe from '../serve.js'

describe('context:serve', () => {
  it('has a description', () => {
    expect(ContextServe.description).toBeDefined()
    expect(typeof ContextServe.description).toBe('string')
  })
})
