import { describe, it, expect } from 'vitest'
import WikiGenerate from '../generate.js'

describe('wiki:generate', () => {
  it('has a description', () => {
    expect(WikiGenerate.description).toBeDefined()
    expect(typeof WikiGenerate.description).toBe('string')
  })
})
