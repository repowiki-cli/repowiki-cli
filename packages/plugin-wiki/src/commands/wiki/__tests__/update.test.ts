import { describe, it, expect } from 'vitest'
import WikiUpdate from '../update.js'

describe('wiki:update', () => {
  it('has a description', () => {
    expect(WikiUpdate.description).toBeDefined()
    expect(typeof WikiUpdate.description).toBe('string')
  })
})
