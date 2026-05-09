import { describe, it, expect } from 'vitest'
import SpecSdd from '../sdd.js'

describe('spec:sdd', () => {
  it('has a description', () => {
    expect(SpecSdd.description).toBeDefined()
    expect(typeof SpecSdd.description).toBe('string')
  })
})
