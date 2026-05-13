import { describe, expect, it } from 'vitest';
import WikiValidate from '../validate.js';

describe('wiki:validate', () => {
  it('has a description', () => {
    expect(WikiValidate.description).toBeDefined();
    expect(typeof WikiValidate.description).toBe('string');
  });

  it('has --output flag with default .repowiki', () => {
    const flag = WikiValidate.flags.output;
    expect(flag).toBeDefined();
    expect((flag as { default?: string }).default).toBe('.repowiki');
  });
});
