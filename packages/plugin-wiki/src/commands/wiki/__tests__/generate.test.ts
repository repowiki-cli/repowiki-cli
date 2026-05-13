import { describe, expect, it } from 'vitest';
import WikiGenerate from '../generate.js';

describe('wiki:generate', () => {
  it('has a description', () => {
    expect(WikiGenerate.description).toBeDefined();
    expect(typeof WikiGenerate.description).toBe('string');
  });

  it('has required --provider flag', () => {
    const provider = WikiGenerate.flags.provider;
    expect(provider).toBeDefined();
    expect((provider as { required?: boolean }).required).toBe(true);
  });

  it('has --harness flag', () => {
    expect(WikiGenerate.flags.harness).toBeDefined();
  });

  it('has --model flag', () => {
    expect(WikiGenerate.flags.model).toBeDefined();
  });

  it('has --concurrency flag with default 5', () => {
    const flag = WikiGenerate.flags.concurrency;
    expect(flag).toBeDefined();
    expect((flag as { default?: number }).default).toBe(5);
  });

  it('has --output flag with default .repowiki', () => {
    const flag = WikiGenerate.flags.output;
    expect(flag).toBeDefined();
    expect((flag as { default?: string }).default).toBe('.repowiki');
  });
});
