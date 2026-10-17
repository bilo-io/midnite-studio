// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { forgeManifest } from '@midnite/studio-feature-forge/main';
import { testsManifest } from '@midnite/studio-feature-tests/main';
import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared';

import { createCoderBridge, type RendererIpc } from './bridge';
import { CODER_GIT_CHANNELS } from './git';

function fakeIpc(): RendererIpc {
  return { invoke: vi.fn(async () => 'answer'), send: vi.fn(), on: vi.fn(), removeListener: vi.fn() };
}

describe('createCoderBridge', () => {
  it('exposes exactly forge, forgeProject, forgeAccounts, tests, remotes, five repos members, log and four status reads', () => {
    const bridge = createCoderBridge(fakeIpc());
    expect(Object.keys(bridge).sort()).toEqual(['forge', 'forgeAccounts', 'forgeProject', 'log', 'remotes', 'repos', 'status', 'tests']);
    expect(Object.keys(bridge.repos).sort()).toEqual(['close', 'list', 'open', 'pickDirectory', 'refs']);
    // Reads only: no `fileDiff` of the working tree, no conflict regions, nothing staged or written.
    expect(Object.keys(bridge.status).sort()).toEqual(['commitDetail', 'commitFileDiff', 'commitStats', 'get']);
  });

  it('has no secrets, fs, pty or ops namespace — no token can be read, and nothing writes to a checkout', () => {
    const bridge = createCoderBridge(fakeIpc()) as Record<string, unknown>;
    for (const name of ['secrets', 'fs', 'fsWrite', 'pty', 'ops', 'terminal']) expect(name in bridge).toBe(false);
  });

  it('invokes only channels the forge and tests features or Coder itself register', async () => {
    const ipc = fakeIpc();
    const bridge = createCoderBridge(ipc);
    for (const group of [bridge.forge, bridge.forgeProject, bridge.forgeAccounts, bridge.tests, bridge.remotes, bridge.repos, bridge.log, bridge.status]) {
      for (const member of Object.values(group)) if (typeof member === 'function') await (member as (req?: unknown) => unknown)({});
    }
    const own = [CHANNELS.repoList, CHANNELS.repoPickDirectory, CHANNELS.repoOpen, CHANNELS.repoClose, CHANNELS.remotesList, ...CODER_GIT_CHANNELS];
    const allowed = new Set<string>([...forgeManifest.ipc, ...testsManifest.ipc, ...own]);
    const invoked = vi.mocked(ipc.invoke).mock.calls.map((c) => c[0]);
    expect(invoked.filter((c) => !allowed.has(c))).toEqual([]);
    const sent = vi.mocked(ipc.send).mock.calls.map((c) => c[0]).sort();
    expect(sent).toEqual([...forgeManifest.sends, ...testsManifest.sends].sort());
    const subscribed = vi.mocked(ipc.on).mock.calls.map((c) => c[0]).sort();
    expect(subscribed).toEqual(
      [EVENT_CHANNELS.forgeChanged, EVENT_CHANNELS.testsOutput, EVENT_CHANNELS.testsResult, EVENT_CHANNELS.logBatch, EVENT_CHANNELS.logDone].sort(),
    );
  });
});
