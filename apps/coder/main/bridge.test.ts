// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { apiClientManifest } from '@midnite/studio-feature-api-client/main';
import { databaseManifest } from '@midnite/studio-feature-database/main';
import { forgeManifest } from '@midnite/studio-feature-forge/main';
import { sessionsManifest } from '@midnite/studio-feature-sessions/main';
import { testsManifest } from '@midnite/studio-feature-tests/main';
import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared';

import { createCoderBridge, type RendererIpc } from './bridge';
import { CODER_GIT_CHANNELS } from './git';

function fakeIpc(): RendererIpc {
  return { invoke: vi.fn(async () => 'answer'), send: vi.fn(), on: vi.fn(), removeListener: vi.fn() };
}

describe('createCoderBridge', () => {
  it('exposes exactly forge, forgeProject, forgeAccounts, tests, apiClient, db, remotes, five repos members, log, four status reads and the attach-only sessions pair', () => {
    const bridge = createCoderBridge(fakeIpc());
    expect(Object.keys(bridge).sort()).toEqual([
      'apiClient',
      'db',
      'forge',
      'forgeAccounts',
      'forgeProject',
      'log',
      'pty',
      'remotes',
      'repos',
      'status',
      'terminal',
      'tests',
    ]);
    // Sessions attach to what the host's broker serves: list it, stream, type, resize — never start or end one.
    expect(Object.keys(bridge.terminal)).toEqual(['list']);
    expect(Object.keys(bridge.pty).sort()).toEqual(['input', 'onData', 'onExit', 'resize', 'snapshot', 'subscribe', 'unsubscribe']);
    expect(Object.keys(bridge.repos).sort()).toEqual(['close', 'list', 'open', 'pickDirectory', 'refs']);
    // Reads only: no `fileDiff` of the working tree, no conflict regions, nothing staged or written.
    expect(Object.keys(bridge.status).sort()).toEqual(['commitDetail', 'commitFileDiff', 'commitStats', 'get']);
  });

  it('has no secrets, fs or ops namespace, and its pty cannot start or end a session', () => {
    const bridge = createCoderBridge(fakeIpc()) as Record<string, unknown>;
    for (const name of ['secrets', 'fs', 'fsWrite', 'ops']) expect(name in bridge).toBe(false);
    const pty = bridge['pty'] as Record<string, unknown>;
    for (const name of ['create', 'kill']) expect(name in pty).toBe(false);
  });

  it('exposes no member that reads a stored credential: the db slice has no password getter, the accounts slice no token', () => {
    const bridge = createCoderBridge(fakeIpc());
    expect(Object.keys(bridge.db).sort()).toEqual([
      'deleteConnection',
      'getSchema',
      'listConnections',
      'onQueryBatch',
      'onQueryDone',
      'queryCancel',
      'queryStart',
      'saveConnection',
      'testConnection',
    ]);
    expect(Object.keys(bridge.forgeAccounts).sort()).toEqual(['add', 'capabilities', 'list', 'reachableRepos', 'remove', 'switch']);
  });

  it('invokes only channels the features or Coder itself register', async () => {
    const ipc = fakeIpc();
    const bridge = createCoderBridge(ipc);
    for (const group of [
      bridge.forge,
      bridge.forgeProject,
      bridge.forgeAccounts,
      bridge.tests,
      bridge.apiClient,
      bridge.db,
      bridge.remotes,
      bridge.repos,
      bridge.log,
      bridge.status,
      bridge.terminal,
      bridge.pty,
    ]) {
      for (const member of Object.values(group)) if (typeof member === 'function') await (member as (req?: unknown) => unknown)({});
    }
    const own = [CHANNELS.repoList, CHANNELS.repoPickDirectory, CHANNELS.repoOpen, CHANNELS.repoClose, CHANNELS.remotesList, ...CODER_GIT_CHANNELS];
    const allowed = new Set<string>([...forgeManifest.ipc, ...testsManifest.ipc, ...apiClientManifest.ipc, ...databaseManifest.ipc, ...sessionsManifest.ipc, ...own]);
    const invoked = vi.mocked(ipc.invoke).mock.calls.map((c) => c[0]);
    expect(invoked.filter((c) => !allowed.has(c))).toEqual([]);
    const sent = vi.mocked(ipc.send).mock.calls.map((c) => c[0]).sort();
    expect(sent).toEqual([...forgeManifest.sends, ...testsManifest.sends, ...sessionsManifest.sends].sort());
    const subscribed = vi.mocked(ipc.on).mock.calls.map((c) => c[0]).sort();
    expect(subscribed).toEqual(
      [
        EVENT_CHANNELS.forgeChanged,
        EVENT_CHANNELS.testsOutput,
        EVENT_CHANNELS.testsResult,
        EVENT_CHANNELS.apiRunProgress,
        EVENT_CHANNELS.apiRunDone,
        EVENT_CHANNELS.dbQueryBatch,
        EVENT_CHANNELS.dbQueryDone,
        EVENT_CHANNELS.logBatch,
        EVENT_CHANNELS.logDone,
        ...sessionsManifest.events,
      ].sort(),
    );
  });

  it('exposes every channel each feature registers, so no tab is wired to nothing', async () => {
    const ipc = fakeIpc();
    const bridge = createCoderBridge(ipc);
    for (const group of [bridge.apiClient, bridge.db]) {
      for (const member of Object.values(group)) if (typeof member === 'function') await (member as (req?: unknown) => unknown)({});
    }
    const invoked = new Set(vi.mocked(ipc.invoke).mock.calls.map((c) => c[0]));
    for (const channel of [...apiClientManifest.ipc, ...databaseManifest.ipc]) expect(invoked.has(channel), channel).toBe(true);
  });
});
