import type { Forge } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { adapterFor } from './registry';

function forge(kind: Forge['kind']): Forge {
  return { host: `${kind}.example`, owner: 'o', repo: 'r', kind };
}

describe('adapterFor', () => {
  it('always returns a GitHub adapter, account or not', () => {
    expect(adapterFor(forge('github'), null)?.kind).toBe('github');
  });

  it('always returns a GitLab adapter — the account is bound in, resolved lazily per call', () => {
    // No account at all still returns an adapter object; every one of its
    // methods reports `cli.reason: 'not-authenticated'` when actually
    // called, rather than `adapterFor` itself deciding "no adapter" — see
    // `registry.ts`'s own docblock.
    expect(adapterFor(forge('gitlab'), null)?.kind).toBe('gitlab');
  });

  it('always returns a Bitbucket adapter, for the identical reason', () => {
    expect(adapterFor(forge('bitbucket'), null)?.kind).toBe('bitbucket');
  });

  it('returns null for a kind with no adapter yet', () => {
    expect(adapterFor(forge('azure'), null)).toBeNull();
    expect(adapterFor(forge('unknown'), null)).toBeNull();
  });
});
