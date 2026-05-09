import { describe, expect, it } from 'vitest';
import SpecAtdd from '../atdd.js';

describe('spec:atdd', () => {
  it('has a description', () => {
    expect(SpecAtdd.description).toBeDefined();
    expect(typeof SpecAtdd.description).toBe('string');
  });
});
