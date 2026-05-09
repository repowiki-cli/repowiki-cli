import { describe, expect, it } from 'vitest';
import ContextQuery from '../query.js';

describe('context:query', () => {
  it('has a description', () => {
    expect(ContextQuery.description).toBeDefined();
    expect(typeof ContextQuery.description).toBe('string');
  });
});
