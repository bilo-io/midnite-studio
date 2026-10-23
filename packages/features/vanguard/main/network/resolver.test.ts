import { describe, expect, it } from 'vitest';

import { createDnsResolver } from './resolver';

describe('createDnsResolver', () => {
  it('lowercases and unmaps forward answers', async () => {
    const resolver = createDnsResolver({ lookup: async () => [{ address: '::ffff:1.2.3.4' }, { address: '2606:4700::1111' }] });
    expect(await resolver.lookup('x.example')).toEqual(['1.2.3.4', '2606:4700::1111']);
  });

  it('answers empty when a lookup fails', async () => {
    const resolver = createDnsResolver({
      lookup: async () => {
        throw new Error('ENOTFOUND');
      },
    });
    expect(await resolver.lookup('x')).toEqual([]);
  });

  it('answers empty when a lookup runs past the deadline', async () => {
    const resolver = createDnsResolver({ lookup: () => new Promise(() => undefined), timeoutMs: 5 });
    expect(await resolver.lookup('x')).toEqual([]);
  });

  it('offers no reverse lookup', () => {
    expect(Object.keys(createDnsResolver())).toEqual(['lookup']);
  });
});
