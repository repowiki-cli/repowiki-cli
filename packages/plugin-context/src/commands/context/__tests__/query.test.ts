import { describe, it, expect } from 'vitest'
import ContextQuery from '../query.js'

describe('context:query', () => {
  it('has a description', () => {
    expect(ContextQuery.description).toBeDefined()
    expect(typeof ContextQuery.description).toBe('string')
  })
})
