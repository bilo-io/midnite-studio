// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { defineFeatureMain } from './feature-main';
import { mountModuleMains } from './module-main';
import { createRecordingContext } from './testing';

const bare = (channel: string) => (ctx: Parameters<ReturnType<typeof defineFeatureMain<null>>['register']>[0]) =>
  ctx.ipc.handleBare(channel, () => ({ ok: true }));

const moduleWith = (id: string, channels: string[]) =>
  defineFeatureMain<null>({
    feature: id,
    channels,
    register(ctx) {
      for (const c of channels) bare(c)(ctx);
    },
  });

describe('mountModuleMains', () => {
  it('registers two modules with disjoint channels in one host', async () => {
    const ctx = createRecordingContext();
    mountModuleMains(ctx, [
      { module: moduleWith('coder', ['coder:a', 'coder:b']), services: null },
      { module: moduleWith('creator', ['creator:a']), services: null },
    ]);
    expect(ctx.channels).toEqual(['coder:a', 'coder:b', 'creator:a']);
    expect(await ctx.invoke('creator:a')).toEqual({ ok: true });
  });

  it('refuses overlapping channels before registering anything', () => {
    const ctx = createRecordingContext();
    expect(() =>
      mountModuleMains(ctx, [
        { module: moduleWith('coder', ['shared:x']), services: null },
        { module: moduleWith('creator', ['shared:x']), services: null },
      ]),
    ).toThrow(/'shared:x' is declared by both module 'coder' and module 'creator'/);
    expect(ctx.channels).toEqual([]);
  });

  it('still validates payloads through the host context', async () => {
    const ctx = createRecordingContext();
    const m = defineFeatureMain<null>({
      feature: 'coder',
      channels: ['coder:echo'],
      register(c) {
        c.ipc.handle<z.ZodObject<{ n: z.ZodNumber }>, number | string>(
          'coder:echo',
          z.object({ n: z.number() }),
          (p) => p.n,
          (issue) => issue,
        );
      },
    });
    mountModuleMains(ctx, [{ module: m, services: null }]);
    expect(await ctx.invoke('coder:echo', { n: 2 })).toBe(2);
    expect(String(await ctx.invoke('coder:echo', { n: 'x' }))).toContain('coder:echo');
  });

  it('registers a shared channel once, from the earlier mount', async () => {
    const ctx = createRecordingContext();
    const first = defineFeatureMain<null>({
      feature: 'sessions',
      channels: ['t:list'],
      register: (c) => c.ipc.handleBare('t:list', () => 'first'),
    });
    const second = defineFeatureMain<null>({
      feature: 'monitor',
      channels: ['t:list', 'm:a'],
      register(c) {
        c.ipc.handleBare('t:list', () => 'second');
        c.ipc.handleBare('m:a', () => 'a');
      },
    });
    mountModuleMains(ctx, [
      { module: first, services: null },
      { module: second, services: null, shared: ['t:list'] },
    ]);
    expect(ctx.channels).toEqual(['t:list', 'm:a']);
    expect(await ctx.invoke('t:list')).toBe('first');
  });

  it('rejects a shared channel no earlier mount declares, or the module does not declare', () => {
    const a = moduleWith('a', ['a:x']);
    const b = moduleWith('b', ['b:x']);
    expect(() =>
      mountModuleMains(createRecordingContext(), [
        { module: a, services: null },
        { module: b, services: null, shared: ['zzz'] },
      ]),
    ).toThrow(/does not declare it/);
    expect(() =>
      mountModuleMains(createRecordingContext(), [
        { module: b, services: null, shared: ['b:x'] },
        { module: a, services: null },
      ]),
    ).toThrow(/no earlier mount declares it/);
  });
});
