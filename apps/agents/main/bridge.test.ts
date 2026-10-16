// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared';

import { createAgentsBridge, type RendererIpc } from './bridge';

function fakeIpc(): RendererIpc {
  return { invoke: vi.fn(async () => 'answer'), send: vi.fn(), on: vi.fn(), removeListener: vi.fn() };
}

describe('createAgentsBridge', () => {
  it('exposes exactly chats, council, ollama, agent.list and secrets.has', () => {
    const bridge = createAgentsBridge(fakeIpc());
    expect(Object.keys(bridge).sort()).toEqual(['agent', 'chats', 'council', 'ollama', 'secrets']);
    expect(Object.keys(bridge.agent)).toEqual(['list']);
  });

  it('can never read or write a secret: only `has` is exposed, so no LLM key can reach the window', () => {
    const { secrets } = createAgentsBridge(fakeIpc());
    expect(Object.keys(secrets)).toEqual(['has']);
    expect('get' in secrets).toBe(false);
    expect('set' in secrets).toBe(false);
  });

  it('invokes the matching channels', async () => {
    const ipc = fakeIpc();
    const bridge = createAgentsBridge(ipc);
    await bridge.chats.list();
    await bridge.council.run.start({ councilId: 'c', prompt: 'p' });
    await bridge.ollama.status();
    await bridge.agent.list();
    await bridge.secrets.has({ key: 'ollama.apiKey' });
    expect(vi.mocked(ipc.invoke).mock.calls.map((c) => c[0])).toEqual([
      CHANNELS.chatsList,
      CHANNELS.councilRunStart,
      CHANNELS.ollamaStatus,
      CHANNELS.agentList,
      CHANNELS.secretsHas,
    ]);
  });

  it('subscribes to the chat and pull-progress events, and tears each down', () => {
    const ipc = fakeIpc();
    const bridge = createAgentsBridge(ipc);
    const off = bridge.chats.onEvent(() => undefined);
    bridge.ollama.onPullProgress(() => undefined);
    expect(vi.mocked(ipc.on).mock.calls.map((c) => c[0])).toEqual([EVENT_CHANNELS.chatsEvent, EVENT_CHANNELS.ollamaPullProgress]);
    off();
    expect(ipc.removeListener).toHaveBeenCalledWith(EVENT_CHANNELS.chatsEvent, expect.any(Function));
  });
});
