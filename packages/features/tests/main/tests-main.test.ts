// @vitest-environment node
import { createRecordingContext } from '@midnite/studio-runtime';
import { describe, expect, it } from 'vitest';

import { testsManifest } from '../manifest';
import { testsMain } from './index';

describe('testsMain.register', () => {
  it('registers exactly the manifest invoke channels plus its one-way cancel', () => {
    const ctx = createRecordingContext();
    testsMain.register(ctx, { workdir: async () => null, warn: () => undefined });
    expect([...ctx.channels].sort()).toEqual([...testsManifest.ipc, ...testsManifest.sends].sort());
  });
});
