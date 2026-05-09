import { describe, it, expect } from 'vitest'
import SpecReview from '../review.js'

describe('spec:review', () => {
  it('has a description', () => {
    expect(SpecReview.description).toBeDefined()
    expect(typeof SpecReview.description).toBe('string')
  })
})
