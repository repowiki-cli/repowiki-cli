import { describe, expect, it } from 'vitest';
import WikiValidate from '../validate.js';

describe('wiki:validate', () => {
  it('has a description', () => {
    expect(WikiValidate.description).toBeDefined();
    expect(typeof WikiValidate.description).toBe('string');
  });
});
