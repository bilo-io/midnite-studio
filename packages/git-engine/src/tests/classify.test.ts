import { describe, expect, it } from 'vitest';

import { classifySuite, isCandidateScript } from './classify';

const configs = { vitest: false, playwright: false, jest: false, cypress: false };

describe('isCandidateScript', () => {
  it('excludes build/dev tooling by name, even if the command would match a runner', () => {
    expect(isCandidateScript('build', 'tsc -b')).toBe(false);
    expect(isCandidateScript('dev', 'vite')).toBe(false);
    expect(isCandidateScript('bundle', 'node scripts/bundle.mjs')).toBe(false);
  });

  it('includes a script whose name looks test-ish even with an unrecognised command', () => {
    expect(isCandidateScript('smoke', 'tsx scripts/smoke.ts')).toBe(true);
  });

  it('includes a script whose command runs a known runner even with a plain name', () => {
    expect(isCandidateScript('ci', 'vitest run')).toBe(true);
  });

  it('excludes a script matching neither signal', () => {
    expect(isCandidateScript('start', 'node index.js')).toBe(false);
  });
});

describe('classifySuite', () => {
  it('prefers a config-gated runner match over a generic name', () => {
    expect(classifySuite('test', 'vitest run', { ...configs, vitest: true })).toBe('unit');
    expect(classifySuite('test', 'playwright test', { ...configs, playwright: true })).toBe('e2e');
  });

  it('falls back to script-name keywords with no config file to lean on', () => {
    expect(classifySuite('smoke', 'tsx scripts/smoke.ts', configs)).toBe('smoke');
    expect(classifySuite('lint', 'eslint .', configs)).toBe('lint');
    expect(classifySuite('typecheck', 'tsc --noEmit', configs)).toBe('typecheck');
    expect(classifySuite('test:integration', 'vitest run', configs)).toBe('integration');
  });

  it('falls back to the runner alone when the config is absent', () => {
    expect(classifySuite('ci', 'vitest run', configs)).toBe('unit');
  });

  it('is the honest "other" for anything unrecognised', () => {
    expect(classifySuite('check', 'node scripts/check.js', configs)).toBe('other');
  });
});
