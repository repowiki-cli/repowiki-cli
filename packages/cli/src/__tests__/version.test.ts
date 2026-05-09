import { describe, it, expect } from 'vitest'
import { VERSION } from '../index.js'

describe('repowiki-cli', () => {
  it('exports VERSION', () => {
    expect(VERSION).toBe('0.0.1')
  })
})
