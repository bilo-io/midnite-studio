// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createRecordingContext } from '@midnite/studio-runtime';
import type { ScriptRun } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { apiClientManifest } from '../manifest';
import { apiClientMain, shutdownApiClient, type ScriptRunner } from './index';
import { __resetApiClientForTests } from './services';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'mstudio-api-main-'));
});

afterEach(async () => {
  __resetApiClientForTests();
  await rm(root, { recursive: true, force: true });
});

const noDialogs = { pickFile: async () => null, pickSavePath: async () => null };

describe('apiClientMain.register', () => {
  it('registers exactly the manifest invoke channels', () => {
    const ctx = createRecordingContext();
    apiClientMain.register(ctx, { workdir: async () => null, dialogs: noDialogs });
    expect([...ctx.channels].sort()).toEqual([...apiClientManifest.ipc].sort());
  });

  it('answers a repository that is not open with a failure, never a throw', async () => {
    const ctx = createRecordingContext();
    apiClientMain.register(ctx, { workdir: async () => null, dialogs: noDialogs });

    const result = await ctx.invoke('mstudio:api-client:list-collections', { repoId: 'gone' });

    expect(result).toMatchObject({ ok: false });
  });

  it('lists the collections of the checkout the composer resolves', async () => {
    const ctx = createRecordingContext();
    apiClientMain.register(ctx, { workdir: async (repoId) => (repoId === 'r1' ? root : null), dialogs: noDialogs });

    const result = await ctx.invoke('mstudio:api-client:list-collections', { repoId: 'r1' });

    expect(result).toEqual({ ok: true, value: [] });
  });

  it('answers a script run with consent-needed until the collection is trusted, and never reaches the runner', async () => {
    let ran = 0;
    const scriptRunner: ScriptRunner = {
      run: async (): Promise<ScriptRun> => {
        ran += 1;
        return { results: [], logs: [], mutations: { environment: {}, collectionVariables: {} }, error: null };
      },
      dispose: () => undefined,
    };
    const ctx = createRecordingContext();
    apiClientMain.register(ctx, { workdir: async () => root, dialogs: noDialogs, scriptRunner });

    const result = await ctx.invoke('mstudio:api-client:run-script', {
      repoId: 'r1',
      collectionId: 'c.postman_collection.json',
      source: 'pm.test("x", () => {})',
      environmentId: null,
      collectionVariables: [],
      request: { method: 'GET', url: 'http://x', headers: {} },
      response: null,
    });

    expect(result).toEqual({ ok: true, value: { status: 'needs-consent' } });
    expect(ran).toBe(0);
  });

  it('kills the script runner and stops running collections on shutdown', () => {
    let disposed = 0;
    const ctx = createRecordingContext();
    apiClientMain.register(ctx, {
      workdir: async () => root,
      dialogs: noDialogs,
      scriptRunner: { run: async () => { throw new Error('unused'); }, dispose: () => { disposed += 1; } },
    });

    shutdownApiClient();

    expect(disposed).toBe(1);
  });
});
